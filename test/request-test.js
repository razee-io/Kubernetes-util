/**
 * Copyright 2023 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const assert = require('chai').assert;
const nock = require('nock');
const RequestLib = require('../lib/request');
const Stream = require('stream');
const log = require('../lib/bunyan-api').createLogger('request-test');

describe('request', () => {
  describe('getStream', () => {
    it('should return stream that receives response, data, and error events with expected response code and payload', (done) => {
      // Create a dummy stream that will return data 3 times and then an error
      let eventCount = 0;
      const mockEventStream = new Stream.Readable({
        objectMode: true,
        read: function() {
          eventCount++;
          if (eventCount <= 3) {
            log.info( `stream returning data (event ${eventCount})` );
            return this.push(JSON.stringify({message: `event${eventCount}`}));
          }
          else {
            log.info( `stream returning error (event ${eventCount})` );
            return this.emit('error', new Error( 'errstring' ));
          }
        }
      });

      // Start nock, returning dummy stream
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(200, mockEventStream);

      let gotResponse = false;
      let gotData = false;
      try {
        // Get a stream, verify it receives events
        RequestLib.getStream({
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
        })
          .on( 'response', (response) => {
            gotResponse = true;
            assert.equal(response.statusCode, 200);
          } )
          .on( 'data', (data) => {
            gotData = true;
            const parsedData = JSON.parse( data );
            assert.exists(parsedData.message);
          } )
          .on( 'error', (err) => {
            assert.equal( err, 'Error: errstring' );
            assert.isTrue(gotResponse, 'Response event was not received');
            assert.isTrue(gotData, 'Data event was not received');
            done();
          } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });
  });

  describe('doRequest', () => {
    it('should handle GET with standard options (json:true, simple:false, full:true)', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(409, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          assert.fail(`Promise was rejected: ${error}`);
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });

    it('should handle GET with simple:true', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(409, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: true,
          simple: true,
        }).then( response => {
          assert.fail(`Promise resolved despite 409 response code: ${response}`);
        }).catch( error => {
          assert.include( error.toString(), '409' );
          done();
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });

    it('should handle GET with full:false', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning testPayload
      nock('https://localhost:666')
        .get('/testEndpoint')
        .reply(406, testPayload);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'get',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: false,
          json: true,
          simple: false,
        }).then( response => {
          assert.deepEqual( response, testPayload );
          done();
        }).catch( error => {
          assert.fail(`Promise was rejected: ${error}`);
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });

    it('should handle POST with standard options (json:true, simple:false, full:true)', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => requestBody);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          body: testPayload,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          assert.fail(`Promise was rejected: ${error}`);
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });

    it('should handle POST with json holding payload', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => requestBody);

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          json: testPayload,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          assert.fail(`Promise was rejected: ${error}`);
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });

    it('should handle POST with form holding payload', (done) => {
      const testPayload = { testKey: 'testVal' };

      // Start nock, returning whatever was posted
      nock('https://localhost:666')
        .post('/testEndpoint')
        .reply(409, (uri, requestBody) => {
          const parts = requestBody.split('=');
          const retVal = {};
          retVal[parts[0]] = parts[1];
          return retVal;
        });

      try {
        // Make request, verify response
        RequestLib.doRequest({
          method: 'post',
          baseUrl: 'https://localhost:666',
          uri: '/testEndpoint',
          resolveWithFullResponse: true,
          form: testPayload,
          json: true,
          simple: false,
        }).then( response => {
          assert.equal( response.statusCode, 409 );
          assert.deepEqual( response.body, testPayload );
          done();
        }).catch( error => {
          assert.fail(`Promise was rejected: ${error}`);
        } );
      } catch (err) {
        assert.fail(`Error was thrown: ${err}`);
      }
    });
  });
});
