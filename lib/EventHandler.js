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
const merge = require('deepmerge');
const touch = require('touch');
const watchman = require('./Watchman');


module.exports = class EventHandler {
  constructor(params = {}) {
    this._kubeResourceMeta = params.kubeResourceMeta;
    this._kc = params.kubeClass;
    this._factory = params.factory;
    this._finalizerString = params.finalizerString;
    if (params.livenessInterval) {
      if (Number.isInteger(params.livenessInterval)) {
        this._livenessInterval = params.livenessInterval;
      } else if (String(params.livenessInterval) === 'true') {
        this._livenessInterval = 60000; //One minute
      }
    }

    this._logger = params.logger || require('../bunyan-api').createLogger('EventHandler');

    if (!(this._kubeResourceMeta &&
      this._kubeResourceMeta.constructor &&
      this._kubeResourceMeta.constructor.name === 'KubeResourceMeta' &&
      this._kubeResourceMeta.hasVerb('watch'))) {
      throw Error('Resource does not support verb "watch"');
    }
    if (!this._kc) {
      throw Error('Must pass in KubeClass instance');
    }
    if (!(this._factory && this._factory.constructor)) {
      throw Error('Must pass in valid Factory');
    }

    // Gather variables and use to create watchman
    let opt = {
      logger: this._logger,
      requestOptions: merge(this._kubeResourceMeta.kubeApiConfig, params.requestOptions || {}),
      watchUri: this._kubeResourceMeta.uri({ watch: true })
    };
    this._wm = new watchman(opt, (data) => this.eventHandler(data));
    this._wm.watch();
    if (this._livenessInterval) {
      touch.sync('/tmp/liveness');
      setInterval(() => {
        if (this._wm.watching) {
          touch.sync('/tmp/liveness');
        }
      }, this._livenessInterval);
    }
  }

  // Event Handler
  async eventHandler(data) {
    let params = {
      kubeResourceMeta: this._kubeResourceMeta.clone(),
      eventData: data,
      kubeClass: this._kc,
      logger: this._logger,
      finalizerString: this._finalizerString
    };
    const controller = new this._factory(params);
    return await controller.execute();
  }

};
