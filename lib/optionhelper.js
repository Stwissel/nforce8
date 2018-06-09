"use strict";

const promises = require("./promises");
const CONST = require("./constants");
const _ = require("lodash");

/**
 * Utility function to transfer incoming options into complete options
 * based on default values
 *
 */

function OptionHelper() {
  // Defaults if needed

  function getApiRequestResolver(opts, callback) {
    //TODO: reevalaute sequence of priorities for resolver
    return (
      opts._resolver ||
      (opts.callback ? promises.createResolver(opts.callback) : undefined) ||
      promises.createResolver(callback)
    );
  }

  // Cleanup the options for an API Request
  function getApiRequestOptions(opts) {
    // The resulting options
    const ropts = {};

    const apiVersion = opts.apiVersion || CONST.apiVersion;

    // Define the URI to call
    if (opts.uri) {
      ropts.uri = opts.uri;
    } else {
      if (!opts.resource || opts.resource.charAt(0) !== "/") {
        opts.resource = "/" + (opts.resource || "");
      }
      ropts.uri = [
        opts.oauth.instance_url,
        "/services/data/",
        apiVersion,
        opts.resource
      ].join("");
    }

    // set blob mode
    if (opts.blob === true) {
      ropts.encoding = null;
    }

    ropts.method = opts.method || "GET";

    // set accept headers
    ropts.headers = {
      Accept: "application/json;charset=UTF-8"
    };

    // set oauth header
    if (opts.oauth) {
      ropts.headers.Authorization = "Bearer " + opts.oauth.access_token;
    }

    // set gzip headers
    if (opts.method === "GET" && opts.gzip === true) {
      ropts.headers["Accept-Encoding"] = "gzip";
      ropts.encoding = null;
    }

    // set content-type
    if (opts.multipart) {
      ropts.headers["content-type"] = "multipart/form-data";
      ropts.multipart = opts.multipart;
      ropts.preambleCRLF = true;
      ropts.postambleCRLF = true;
    } else {
      ropts.headers["content-type"] = "application/json";
    }

    // set additional user-supplied headers
    if (opts.headers) {
      for (var item in opts.headers) {
        ropts.headers[item] = opts.headers[item];
      }
    }

    // set body
    if (opts.body) {
      ropts.body = opts.body;
    }

    // process qs
    if (opts.qs) {
      ropts.qs = opts.qs;
    }

    // process request opts
    if (opts.requestOpts) {
      _.merge(ropts, opts.requestOpts);
    }

    // set timeout
    if (opts.timeout) {
      ropts.timeout = opts.timeout;
    }

    return ropts;
  }

  return Object.freeze({ getApiRequestOptions, getApiRequestResolver });
}

module.exports = OptionHelper;
