/**
 * Created by vladimirkunin on 13.06.17.
 */
'use strict';

const request = require('request'),
    path = require('path'),
    mime = require('mime'),
    fs = require('fs'),
    log = require('debug')('itop'),
    debug = require('debug')('itop:data');

/**
 * @class ITopApiClient
 */
class ITopApiClient {

    /**
     * ITopApiClient constructor
     */
    constructor() {
        log(`Create iTop API client for ${process.env.NODE_ENV} environment.`);
    }

    /**
     * @param {string} uri
     * @param {string} user
     * @param {string} password
     * @param {string} comment - отображется в истории изменений в iTop
     * @param {number} [apiVersion=1.3]
     * @param {boolean} [basicAuth=true]
     * @returns {Promise}
     */
    connect({ uri, user, password, comment = 'iTop API client', apiVersion = 1.3, basicAuth = true }) {
        this._uri = uri;
        this._user = user;
        this._password = password;
        this._comment = comment;
        this._apiVersion = apiVersion;
        this._basicAuth = basicAuth;
        log(`Try to connect with params: uri = ${this._uri}, user = ${this._user}, comment = ${this._comment}.`);

        let jsonData = {
            operation: "core/check_credentials",
            user: this._user,
            password: this._password,
        };

        return this.apiCall(jsonData, undefined, 'all')
            .then(result => {
                if (result.authorized) log('Connected!');
                else throw new ITopApiError('Authorization failed! Check user credentials.');
            })
            .catch(err => console.error(err));
    }

    /**
     * Вызов iTop JSON API
     * @param {Object} jsonData - json_data
     * @param {string[]} [outputFields=['*']] - возвращаемые поля, по умолчанию ['*']
     * @param {string} [retMode] - "array" или "object", формат возвращаемых данных
     * @param {boolean} [retFieldsOnly] - в случае true не вернет обертку: { "class": "SelfServiceTerminal", "code": 0, ... }
     * @returns {Promise}
     */
    apiCall(jsonData, outputFields = ['*'], retMode, retFieldsOnly) {
        // Если переданы поля, то не возвращать  { "class": "SelfServiceTerminal", "code": 0, ... }
        retFieldsOnly = retFieldsOnly !== undefined ? retFieldsOnly : outputFields.filter(e => e !== '*').length > 0;
        jsonData.output_fields = outputFields.join(',');
        jsonData.comment = this._comment;
        debug(jsonData);
        return new Promise((resolve, reject) => {
            let data = {
                version: this._apiVersion,
                json_data: JSON.stringify(jsonData)
            };
            // TODO: в конфиг?
            let tries = 2;
            let retryInterval = 2000;
            // такое объявление использует контекст (.bind не нужен)
            let send = () => {
                let req = request.post(this._uri, (err, res, body) => {
                    if (err) return reject(err);
                    debug(res.statusCode + ' ' + res.statusMessage);
                    if (res.statusCode === 200) {
                        ITopApiClient.prepareResult(JSON.parse(body), retMode, retFieldsOnly, (err, result) => {
                            tries--;
                            if (err) {
                                // console.log(err.code);
                                if (err.code === 1 && tries > 0) return setTimeout(send, retryInterval);
                                return reject(err);
                            }
                            resolve(result);
                        });
                    } else {
                        reject(new Error(`API response status: ${res.statusCode}.`));
                    }
                });
                if (this._basicAuth) {
                    req.auth(this._user, this._password, true);
                } else {
                    data.auth_user = this._user;
                    data.auth_pwd = this._password;
                }
                req.form(data);
            };
            send();
        });
    }

    /**
     * This callback type is called `resultCallback` and is displayed as a global symbol    .
     *
     * @callback resultCallback
     * @param {(null|Object)} err
     * @param {(Object|Object[])} [result]
     */

    /**
     * Подготовка и проверка результата
     * @param {Object} result - результат запроса к iTop API
     * @param {string} [retMode='array'] - "array" или "object", формат возвращаемых данных
     * @param {boolean} [retFieldsOnly=true] - в случае true не вернет обертку: { "class": "SelfServiceTerminal", "code": 0, ... }
     * @param {resultCallback} cb - колбек
     *
     * @static
     */
    static prepareResult(result, retMode = 'array', retFieldsOnly = true, cb) {
        debug(result);
        if (result.code === 0) {
            if (result.objects === null) result.objects = {};
            let ret;
            switch (retMode) {
                case 'array':
                    ret = retFieldsOnly
                        ? Object.keys(result.objects).map(key => result.objects[key].fields)
                        : Object.keys(result.objects).map(key => result.objects[key]);
                    break;
                case 'object':
                    ret = result.objects;
                    break;
                case 'all':
                default:
                    ret = result;
            }
            cb(null, ret);
        } else {
            cb(new ITopApiError(result.message, result.code));
        }
    }

    listOperations() {
        return this.apiCall({ operation: 'list_operations', 'class': '' });
    }

    /**
     * core/get
     * @param {string} objClass
     * @param {(string|number|Object)} objKey - OQL, id или { name: 'Название', org_id: 2 }
     * @param {string[]} [outputFields]
     * @param {string} [retMode]
     * @param {boolean} [retFieldsOnly]
     * @returns {Promise}
     */
    get({ objClass, objKey, outputFields, retMode, retFieldsOnly }) {
        let jsonData = {
            operation: 'core/get',
            'class': objClass,
            key: objKey
        };
        return this.apiCall(jsonData, outputFields, retMode, retFieldsOnly);
    }

    /**
     * core/create
     * @param {string} objClass
     * @param {Object} fields
     * @param {string[]} [outputFields]
     * @param {string} [retMode]
     * @param {boolean} [retFieldsOnly]
     * @returns {Promise}
     */
    create(objClass, fields, outputFields, retMode, retFieldsOnly) {
        let jsonData = {
            operation: 'core/create',
            'class': objClass,
            fields: fields
        };
        return this.apiCall(jsonData, outputFields, retMode, retFieldsOnly);
    }

    /**
     * core/apply_stimulus
     * @param {string} objClass
     * @param {(string|number|Object)} objKey
     * @param {string} stimulus
     * @param {object} fields
     * @param {string[]} [outputFields]
     * @param {string} [retMode]
     * @param {boolean} [retFieldsOnly]
     * @returns {Promise}
     */
    applyStimulus(objClass, objKey, stimulus, fields, outputFields, retMode, retFieldsOnly) {
        let jsonData = {
            operation: 'core/apply_stimulus',
            'class': objClass,
            key: objKey,
            stimulus: 'ev_' + stimulus,
            fields: fields
        };
        return this.apiCall(jsonData, outputFields, retMode, retFieldsOnly);
    }

    /**
     * core/update
     * @param {string} objClass
     * @param {(string|number|Object)} objKey
     * @param {Object} fields
     * @param {string[]} [outputFields]
     * @param {string} [retMode]
     * @param {boolean} [retFieldsOnly]
     * @returns {Promise}
     */
    update({ objClass, objKey, fields, outputFields, retMode, retFieldsOnly }) {
        let jsonData = {
            operation: 'core/update',
            'class': objClass,
            key: objKey,
            fields: fields
        };
        return this.apiCall(jsonData, outputFields, retMode, retFieldsOnly);
    }

    /**
     * core/delete
     * @param {string} objClass
     * @param {(string|number|Object)} objKey
     * @param {boolean} [simulate=false]
     * @param {string[]} [outputFields]
     * @param {string} [retMode]
     * @param {boolean} [retFieldsOnly]
     * @returns {Promise}
     */
    remove(objClass, objKey, simulate = false, outputFields, retMode, retFieldsOnly) {
        let jsonData = {
            operation: 'core/delete',
            'class': objClass,
            key: objKey,
            simulate: simulate
        };
        return this.apiCall(jsonData, outputFields, retMode, retFieldsOnly);
    }

    // TODO: Протестировать!
    addAttachment(itemClass, itemId, filePath, outputFields, retMode, retFieldsOnly) {
        let fields = {
            item_class: itemClass,
            item_id: itemId,
            contents: {
                filename: path.basename(filePath),
                mimetype: mime.lookup(filePath),
                data: fs.readFileSync(filePath, 'base64')
            }
        };
        return this.create('Attachment', fields, outputFields, retMode, retFieldsOnly);
    }
}

/**
 0	OK	No issue has been encountered
 1	UNAUTHORIZED	Missing/wrong credentials or the user does not have enough rights to perform the requested operation
 2	MISSING_VERSION	The parameter 'version' is missing
 3	MISSING_JSON	The parameter 'json_data' is missing
 4	INVALID_JSON	The input structure is not a valid JSON string
 5	MISSING_AUTH_USER	The parameter 'auth_user' is missing
 6	MISSING_AUTH_PWD	The parameter 'auth_pwd' is missing
 10	UNSUPPORTED_VERSION	No operation is available for the specified version
 11	UNKNOWN_OPERATION	The requested operation is not valid for the specified version
 12	UNSAFE	The requested operation cannot be performed because it can cause data (integrity) loss
 100	INTERNAL_ERROR	The operation could not be performed, see the message for troubleshooting
 */
class ITopApiError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}

module.exports = new ITopApiClient();