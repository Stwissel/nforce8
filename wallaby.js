module.exports = function (/*wallaby*/) {
  return {
    files: [
      'index.js',
      'lib/*.js',
      'package.json'
    ],

    tests: [
      'test/*.js'
    ],
    env: {
      type: 'node'
    }
  };
};