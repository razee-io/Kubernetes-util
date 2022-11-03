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
const touch = require('touch');
const watchman = require('./Watchman');
const objectPath = require('object-path');


module.exports = class EventHandler {
  constructor(params = {}) {
    this._kubeResourceMeta = params.kubeResourceMeta;
    this._kc = params.kubeClass;
    this._factory = params.factory;
    this._finalizerString = params.finalizerString;
    this._options = params.options;
    if (params.livenessInterval) {
      if (Number.isInteger(params.livenessInterval)) {
        this._livenessInterval = params.livenessInterval;
      } else if (String(params.livenessInterval) === 'true') {
        this._livenessInterval = 60000; //One minute
      }
    }
    this._watchTimeoutSeconds = objectPath.get(params, 'requestOptions.qs.timeoutSeconds', 300); // time in seconds when the watch should be re-initialized. default: 300s
    if (!Number.isInteger(this._watchTimeoutSeconds)) {
      const watchTimeoutSeconds = Number.parseInt(this._watchTimeoutSeconds);
      this._watchTimeoutSeconds = (watchTimeoutSeconds > 0) ? watchTimeoutSeconds : 300;
    }
    this._watchTimeoutMilliseconds = this._watchTimeoutSeconds * 1000;

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
      requestOptions: { ...params?.requestOptions, uri: this._kubeResourceMeta.uri({ watch: true }) }
    };
    this._wm = new watchman(opt, (data) => this.eventHandler(data));
    this._wm.watch();

    if (this._livenessInterval) {
      touch.sync('/tmp/liveness');
      setInterval(() => {
        const now = Date.now();
        const millisecondsSinceLastStart = now - this._wm.watchStart;
        const resetThresholdMilliseconds = (this._watchTimeoutMilliseconds + 10000); // interval time and kube timing is not exact, so adding 10 seconds to allow for variance in the watch being restarted by kube
        this._logger.debug(`Time since last start: ${millisecondsSinceLastStart / 1000}s | WatchTimeoutSeconds: ${resetThresholdMilliseconds / 1000}s.`);
        // if watching and time since last start is less than the desired watch restart threshold, then we are still alive.
        if (this._wm.watching && (millisecondsSinceLastStart < resetThresholdMilliseconds)) {
          touch.sync('/tmp/liveness');
        }
      }, this._livenessInterval);
    }

    // every cycle, check if the watch is restarting in the appropriate amount of time
    setInterval(() => {
      const now = Date.now();
      const millisecondsSinceLastStart = now - this._wm.watchStart;
      const resetThresholdMilliseconds = (this._watchTimeoutMilliseconds + 10000); // interval time and kube timing is not exact, so adding 10 seconds to allow for variance without having to wait for an entire extra cycle
      this._logger.debug(`Time since last start: ${millisecondsSinceLastStart / 1000}s | WatchTimeoutSeconds: ${resetThresholdMilliseconds / 1000}s.`);
      // if time since last start is more than the time is should have been, restart the watch here instead of waiting on kube to restart it for us
      if (millisecondsSinceLastStart > resetThresholdMilliseconds) {
        this._logger.debug(`Time since last start: ${millisecondsSinceLastStart / 1000}s > ${resetThresholdMilliseconds / 1000}s ... reseting watch via eventHandler.`);
        this._wm.watch();
      }
    }, (this._watchTimeoutMilliseconds));
  }

  // Event Handler
  async eventHandler(data) {
    let params = {
      kubeResourceMeta: this._kubeResourceMeta.clone(),
      eventData: data,
      kubeClass: this._kc,
      logger: this._logger,
      finalizerString: this._finalizerString,
      options: this._options
    };
    const controller = new this._factory(params);
    return await controller.execute();
  }

};
