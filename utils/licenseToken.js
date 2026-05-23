const crypto = require('crypto');
const fs = require('fs');

const PRIVATE_KEY_ENV_NAME = 'RSA_PRIVATE_KEY';
const PRIVATE_KEY_PATH_ENV_NAME = 'RSA_PRIVATE_KEY_PATH';
const PUBLIC_KEY_ENV_NAME = 'RSA_PUBLIC_KEY';
const PUBLIC_KEYS_ENV_NAME = 'RSA_PUBLIC_KEYS';
const ACTIVE_KID_ENV_NAME = 'RSA_ACTIVE_KID';
const TOKEN_ALG = 'RS256';
const TOKEN_TYP = 'MLT';

const encode = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const resolvePrivateKey = () => {
  if (process.env[PRIVATE_KEY_ENV_NAME]) {
    return process.env[PRIVATE_KEY_ENV_NAME].replace(/\\n/g, '\n');
  }

  if (process.env[PRIVATE_KEY_PATH_ENV_NAME]) {
    return fs.readFileSync(process.env[PRIVATE_KEY_PATH_ENV_NAME], 'utf8');
  }

  throw new Error(`Missing RSA private key. Set ${PRIVATE_KEY_ENV_NAME} or ${PRIVATE_KEY_PATH_ENV_NAME}.`);
};

const getPublicKeys = () => {
  const keys = {};

  if (process.env[PUBLIC_KEY_ENV_NAME]) {
    keys[process.env[ACTIVE_KID_ENV_NAME] || 'default'] = process.env[PUBLIC_KEY_ENV_NAME].replace(/\\n/g, '\n');
  }

  if (process.env[PUBLIC_KEYS_ENV_NAME]) {
    try {
      const parsed = JSON.parse(process.env[PUBLIC_KEYS_ENV_NAME]);
      for (const [kid, value] of Object.entries(parsed)) {
        keys[kid] = String(value).replace(/\\n/g, '\n');
      }
    } catch (error) {
      throw new Error('RSA_PUBLIC_KEYS must be a valid JSON object');
    }
  }

  return keys;
};

const getActiveKid = () => process.env[ACTIVE_KID_ENV_NAME] || 'default';

const signLicenseToken = (payload) => {
  // Compact JWS-like token so the Flutter/Desktop client can verify it with the public key only.
  const header = {
    alg: TOKEN_ALG,
    typ: TOKEN_TYP,
    kid: getActiveKid()
  };

  const encodedHeader = encode(header);
  const encodedPayload = encode(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();

  const signature = signer.sign(resolvePrivateKey(), 'base64url');

  return {
    token: `${signingInput}.${signature}`,
    header
  };
};

const verifyLicenseToken = (token) => {
  const [encodedHeader, encodedPayload, signature] = String(token || '').split('.');

  if (!encodedHeader || !encodedPayload || !signature) {
    return null;
  }

  let header;
  let payload;
  try {
    header = decode(encodedHeader);
    payload = decode(encodedPayload);
  } catch (error) {
    return null;
  }

  const publicKeys = getPublicKeys();
  const publicKey = publicKeys[header.kid];
  if (!publicKey) {
    return null;
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  if (!verifier.verify(publicKey, signature, 'base64url')) {
    return null;
  }

  return {
    header,
    payload
  };
};

module.exports = {
  signLicenseToken,
  verifyLicenseToken,
  getPublicKeys,
  getActiveKid
};
