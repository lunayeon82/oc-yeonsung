const { customAlphabet } = require('nanoid');

const generatePid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8);

module.exports = { generatePid };
