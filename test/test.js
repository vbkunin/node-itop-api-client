'use strict';

require('dotenv').config();
const itop = require('../index');
const connOpts = {
    url: process.env.URL,
    user: process.env.LOGIN,
    password: process.env.PASSWORD,
    comment: process.env.COMMENT
};

const log = process.env.DEBUG ? console.dir : () => {};

//dev-dependencies
const chai = require('chai');
const should = chai.should();

const getNewValidEmail = () => Math.round(Math.random() * Math.pow(10, 9)) + '@test.test';

const person = {
    name: 'User',
    first_name: 'Test',
    org_id: 1,
    email: getNewValidEmail()
};

const opts = {
    objClass: 'Person',
    fields: person,
    outputFields: [ 'id', 'friendlyname' ]
};

describe('node-itop-api-client', () => {

    before(done => {
        itop.connect(connOpts)
            .then(res => itop.listOperations())
            .then(log)
            .then(res => done())
            .catch(done);
    });

    describe('crud', () => {

        it('should create a new person', done => {
            itop.create(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res[0].should.have.property('id');
                    res[0].should.have.property('friendlyname', `${person.first_name} ${person.name}`);
                    person.id = res[0].id;
                    person.friendlyname = res[0].friendlyname;
                    done();
                })
                .catch(done);
        });

        it('should get by id', done => {
            opts.objKey = person.id;
            itop.get(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.equal(1);
                    res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        });

        it('should get by OQL', done => {
            opts.objKey = `SELECT Person WHERE email = '${person.email}'`;
            itop.get(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.greaterThan(0);
                    res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        });

        it('should get by object', done => {
            opts.objKey = { name: person.name, first_name: person.first_name, email: person.email };
            itop.get(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.greaterThan(0);
                    res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        });

        it('should update the person', done => {
            opts.fields = { email: getNewValidEmail() };
            itop.update(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.equal(1);
                    res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        });

        it('should simulate removing the person', done => {
            delete opts.fields;
            opts.objKey = person.id;
            itop.remove(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.greaterThan(0);
                    res[0].should.have.property('id', person.id);
                    return itop.get(opts);
                })
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.equal(1);
                    res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        });

        it('should really remove the person', done => {
            opts.simulate = false;
            itop.remove(opts)
                .then(res => {
                    log(res[0]);
                    res.should.be.an('array');
                    res.length.should.be.greaterThan(0);
                    res[0].should.have.property('id', person.id);
                    return itop.get(opts);
                })
                .then(res => {
                    log(res);
                    res.should.be.an('array');
                    res.should.be.empty;
                    // res[0].should.have.property('id', person.id);
                    done();
                })
                .catch(done);
        })
    });

});