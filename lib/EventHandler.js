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
const objectPath = require('object-path');
const watchman = require('./Watchman');


module.exports = class EventHandler {
  constructor(params = {}) {
    this._kubeResourceMeta = params.kubeResourceMeta;
    this._kc = params.kubeClass;
    this._factory = params.factory;

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


    this._enforcementInterval = params.enforcementInterval || 0; // seconds
    if (this._enforcementInterval > 0) {
      this.startEnforcementInterval();
    }
  }

  // Polling
  startEnforcementInterval() {
    if (this._enforcementIntervalRef) {
      this.stopEnforcementInterval();
    }
    this._enforcementIntervalRef = setInterval(() => { this.enforce(); }, this._enforcementInterval * 1000);
  }

  stopEnforcementInterval() {
    clearInterval(this._enforcementIntervalRef);
    this._enforcementIntervalRef = undefined;
  }

  async enforce() {
    try {
      let next = undefined;
      do {
        let gr = await this._kc.getResourcesPaged([this._kubeResourceMeta], { limit: 500 }, next);
        next = gr.next;
        if (objectPath.get(gr, ['resources', 0]).statusCode === 200) {
          let resources = objectPath.get(gr, ['resources', 0, 'object', 'items'], []);
          resources.map((r) => {
            this.eventHandler({
              type: 'POLLED',
              object: r
            });
          });
        }
      } while (next);
    } catch (e) {
      this._logger.error(e);
    }
  }

  // Event Handler
  async eventHandler(data) {
    let params = {
      kubeResourceMeta: this._kubeResourceMeta,
      eventData: data,
      kubeClass: this._kc,
      logger: this._logger
    };
    new this._factory(params).execute();
  }

};
