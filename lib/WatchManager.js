/**
 * Copyright 2019, 2022 IBM Corp. All Rights Reserved.
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

const Watchman = require('./Watchman');
const log = require('./bunyan-api').createLogger('WatchManager');
const objectPath = require('object-path');
const hash = require('object-hash');

const _watchObjects = {};

module.exports = function WatchManager() {
  // private
  const _saveWatch = function (wm, querySelector, startWatch = true) {
    const selfLink = wm.selfLink;
    _removeWatch(selfLink);
    _watchObjects[selfLink] = { selfLink: wm.selfLink, watchman: wm, querySelectorHash: hash(querySelector) };
    if (startWatch) {
      wm.watch();
    }
    log.info(`Watch added: ${selfLink} ${JSON.stringify(querySelector)}`);
    return _watchObjects[selfLink];
  };

  const _ensureWatch = function (options, objectHandler, globalWatch = false, startWatch = true) {
    const querySelector = objectPath.get(options, 'requestOptions.qs', {});
    const selfLink = options?.requestOptions?.uri;
    const w = _getWatch(selfLink);
    if (w && (!globalWatch || (globalWatch && w.querySelectorHash == hash(querySelector)))) {
      return w;
    }
    const wm = new Watchman(options, objectHandler);
    return _saveWatch(wm, querySelector, startWatch);
  };

  const _startWatch = function (selfLink) {
    return _reWatch(selfLink);
  };

  const _removeWatch = function (selfLink) {
    const w = objectPath.get(_getWatch(selfLink), 'watchman');
    if (w) {
      w.end();
      delete _watchObjects[selfLink];
      log.info(`Watch removed: ${selfLink}`);
    }
    return _watchObjects[selfLink];
  };

  const _getWatch = function (selfLink) {
    return _watchObjects[selfLink];
  };

  const _reWatch = function (selfLink) {
    const w = objectPath.get(_getWatch(selfLink), 'watchman');
    if (w) {
      w.watch();
    }
    return w;
  };

  // public
  return {
    saveWatch: _saveWatch,
    ensureWatch: _ensureWatch,
    startWatch: _startWatch,
    removeWatch: _removeWatch,
    removeAllWatches: function () {
      const watches = Object.keys(_watchObjects);
      watches.forEach(w => _removeWatch(w));
    },
    getWatch: _getWatch,
    getAllWatches: function () {
      return _watchObjects;
    },
    reWatch: _reWatch,
    reWatchAll: function () {
      const watches = Object.keys(_watchObjects);
      watches.forEach(w => _reWatch(w));
    }
  };
};
