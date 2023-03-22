/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
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
const axios = require('axios');
const https = require('https');
const validUrl = require('valid-url');
const JSONStream = require('JSONStream');
const delay = require('delay');
const merge = require('deepmerge');

const KubeApiConfig = require('./KubeApiConfig');

module.exports = class Watchman {
  constructor(options, objectHandler) {
    //PLC need to check any caller's options.requestOptions for request/axios applicability
    if ((typeof objectHandler) !== 'function') {
      throw 'Watchman objectHandler must be a function.';
    }
    this._objectHandler = objectHandler;
    const kac = KubeApiConfig();
    this._requestOptions = merge.all(
      [
        {
          headers: {
            'User-Agent': 'razee-watchman'
          },
          baseURL: kac.baseUrl, // needs the baseurl for validUrl check, but i dont want the other KubeApiConfig values here so that we can fetch them before each call to watch().
        },
        options.requestOptions ?? {}
      ]
    );

    if ((options.logger) && ((typeof options.logger) !== 'object')) {
      throw 'options.logger must be an object.';
    }
    this._logger = options.logger;
    if (!validUrl.isUri(`${this._requestOptions.baseUrl}${this._requestOptions.uri}`) || !this._requestOptions?.uri?.includes('watch')) {
      throw `uri '${this._requestOptions.baseUrl}${this._requestOptions.uri}' not valid watch uri.`;
    }

    this._rewatchOnTimeout = typeof options.rewatchOnTimeout === 'boolean' ? options.rewatchOnTimeout : true;
    this._requestStream = undefined;
    this._jsonStream = undefined;
    this._errors = 0;
    this._error = false;
    this._watching = false;
  }

  //private methods
  get selfLink() {
    return this._requestOptions.uri;
  }
  get logger() {
    return this._logger;
  }
  get objectHandler() {
    return this._objectHandler;
  }
  get watching() {
    return this._watching;
  }
  get watchStart() {
    // Returns the numeric value corresponding to when the watch started — the number of milliseconds elapsed since January 1, 1970 00:00:00 UTC
    return this._watchStart;
  }

  _watchError() {
    this._errors++;
    this._error = true;
    this.end(this._rewatchOnTimeout);
    delay(this._errors * 1000).then(() => {
      if (this._rewatchOnTimeout)
        this.watch();
    });
  }

  // public methods
  async watch() {
    this._logger.debug('Watchman: initializing watch');
    this.end(this._rewatchOnTimeout);
    this._logger.debug('Watchman: attempting new watch ');
    // this._requestOptions must not contain a prior KubeApiConfig(), otherwise the old values will overrite the newly fetched ones
    const axiosOptions = merge(KubeApiConfig(), this._requestOptions, { url: this._requestOptions.uri, responseType: 'stream' });
    // KubeApiConfig can include ca, cert, key attributes.  request recognizes these automatically (though undocumented), axios needs an httpsAgent
    if( axiosOptions.ca && axiosOptions.key && axiosOptions.cert ) {
      axiosOptions.httpsAgent = new https.Agent({
        cert: axiosOptions.cert,
        key: axiosOptions.key,
        ca: axiosOptions.ca,
      });
    }
    const response = await axios(axiosOptions);
    this._requestStream = response.data;
    this._requestStream.on('data', (response) => {
      if (response.status !== 200) {  // request: statusCode, axios: status
        if (this._logger) {
          this._logger.error(`GET ${this._requestOptions.uri} returned ${response.status}`);
        }
        this._watchError();
      } else {
        this._logger.debug('Watchman: watch started');
        this._watchStart = Date.now();
        this._watching = true;
        this._error = false;
      }
    });
    this._requestStream.on('error', (err) => {
      if (this._logger) {
        this._logger.error(`GET ${this._requestOptions.uri} errored`, err);
      }
      this._watchError();
    });
    this._requestStream.on('close', () => {
      this._watching = false;
      if (!this._error) {
        this._errors = 0;
      }
      if (this._logger) {
        this._logger.info(`GET ${this._requestOptions.uri} closed. rewatchOnTimeout: ${this._rewatchOnTimeout}, errors: ${this._errors}`);
      }
      if (this._rewatchOnTimeout && this._errors == 0) {
        this.watch();
      }
    });
    var parser = JSONStream.parse(true);
    parser.on('data', (data) => {
      if (data.type === 'ERROR') {
        if (this._logger) {
          this._logger.error(`GET ${this._requestOptions.uri} errored at data.type === ERROR, aborting`, JSON.stringify(data.object));
        }
        this._requestStream.abort();
      } else {
        this.objectHandler(data);
      }
    });
    parser.on('error', (err) => {
      if (this._logger) {
        this._logger.error(`GET ${this._requestOptions.uri} errored at parser.on error, aborting`, err);
      }
      this._requestStream.abort();
    });
    this._jsonStream = this._requestStream.pipe(parser);
  }

  end(rewatchOnTimeout = false) {
    this._logger.debug('Watchman: ending previous watch');
    this._watching = false;
    this._rewatchOnTimeout = rewatchOnTimeout;
    if (this._requestStream) {
      this._requestStream.destroy();
    }
    this._requestStream = undefined;
    this._jsonStream = undefined;
  }
};
