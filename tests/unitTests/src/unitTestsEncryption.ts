import * as test from 'tape-promise/tape'
import * as triplesec from 'triplesec'
import * as elliptic from 'elliptic'
import * as webCryptoPolyfill from '@peculiar/webcrypto'
import {
  encryptECIES, decryptECIES, getHexFromBN, signECDSA,
  verifyECDSA,  encryptMnemonic, decryptMnemonic
} from '../../../src/encryption'
import { ERROR_CODES } from '../../../src/errors'
import { getGlobalScope } from '../../../src/utils'
import * as pbkdf2 from '../../../src/encryption/pbkdf2'
import * as aesCipher from '../../../src/encryption/aesCipher'
import * as ripemd160 from '../../../src/encryption/hashRipemd160'



export function runEncryptionTests() {
  const privateKey = 'a5c61c6ca7b3e7e55edee68566aeab22e4da26baa285c7bd10e8d2218aa3b229'
  const publicKey = '027d28f9951ce46538951e3697c62588a87f1f1f295de4a14fdd4c780fc52cfe69'

  test('ripemd160 digest tests', async (t) => {
    const vectors = [
      ['The quick brown fox jumps over the lazy dog', '37f332f68db77bd9d7edd4969571ad671cf9dd3b'],
      ['The quick brown fox jumps over the lazy cog', '132072df690933835eb8b6ad0b77e7b6f14acad7'],
      ['a', '0bdc9d2d256b3ee9daae347be6f4dc835a467ffe'],
      ['abc', '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc'],
      ['message digest', '5d0689ef49d2fae572b881b123a85ffa21595f36'],
      ['', '9c1185a5c5e9fc54612808977ee8f548b2258d31']
    ]
    const nodeCryptoHasher = await ripemd160.createHashRipemd160()
    t.equal(nodeCryptoHasher instanceof ripemd160.NodeCryptoRipemd160Digest, true, 'Node crypto should be detected for ripemd160 hash')
    for (const [input, expected] of vectors) {
      const result = await nodeCryptoHasher.digest(Buffer.from(input))
      const resultHex = result.toString('hex')
      t.equal(resultHex, expected)
    }

    const polyfillHasher = new ripemd160.Ripemd160PolyfillDigest()
    for (const [input, expected] of vectors) {
      const result = await polyfillHasher.digest(Buffer.from(input))
      const resultHex = result.toString('hex')
      t.equal(resultHex, expected)
    }

    const nodeCrypto = require('crypto')
    const createHashOrig = nodeCrypto.createHash
    nodeCrypto.createHash = () => { throw new Error('Artificial broken hash') }
    try {
      await ripemd160.hashRipemd160(Buffer.from('acb'))
    } finally {
      nodeCrypto.createHash = createHashOrig
    }
  })

  test('pbkdf2 digest tests', async (t) => {
    const salt = Buffer.alloc(16, 0xf0)
    const password = 'password123456'
    const digestAlgo = 'sha512'
    const iterations = 100000
    const keyLength = 48

    const globalScope = getGlobalScope() as any

    // Remove any existing global `crypto` variable for testing
    const globalCryptoOrig = { defined: 'crypto' in globalScope, value: globalScope.crypto }
    delete globalScope.crypto

    try {
      const nodeCryptoPbkdf2 = await pbkdf2.createPbkdf2()
      t.assert(nodeCryptoPbkdf2 instanceof pbkdf2.NodeCryptoPbkdf2, 'should be type NodeCryptoPbkdf2 when global web crypto undefined')

      // Set global web `crypto` polyfill for testing
      const webCrypto = new webCryptoPolyfill.Crypto()
      globalScope.crypto = webCrypto
      const webCryptoPbkdf2 = await pbkdf2.createPbkdf2()
      t.assert(webCryptoPbkdf2 instanceof pbkdf2.WebCryptoPbkdf2, 'should be type WebCryptoPbkdf2 when global web crypto is available')

      const polyFillPbkdf2 = new pbkdf2.WebCryptoPartialPbkdf2(webCrypto.subtle)
      
      const derivedNodeCrypto = (await nodeCryptoPbkdf2
        .derive(password, salt, iterations, keyLength, digestAlgo)).toString('hex')
      const derivedWebCrypto = (await webCryptoPbkdf2
        .derive(password, salt, iterations, keyLength, digestAlgo)).toString('hex')
      const derivedPolyFill = (await polyFillPbkdf2.
        derive(password, salt, iterations, keyLength, digestAlgo)).toString('hex')

      const expected = '92f603459cc45a33eeb6ee06bb75d12bb8e61d9f679668392362bb104eab6d95027398e02f500c849a3dd1ccd63fb310'
      t.equal(expected, derivedNodeCrypto, 'NodeCryptoPbkdf2 should have derived expected key')
      t.equal(expected, derivedWebCrypto, 'WebCryptoPbkdf2 should have derived expected key')
      t.equal(expected, derivedPolyFill, 'PolyfillLibPbkdf2 should have derived expected key')

    } finally {
      // Restore previous `crypto` global var
      if (globalCryptoOrig.defined) {
        globalScope.crypto = globalCryptoOrig.value
      } else {
        delete globalScope.crypto
      }
    }
  })

  test('aes-cbc tests', async (t) => {
    const globalScope = getGlobalScope() as any

    // Remove any existing global `crypto` variable for testing
    const globalCryptoOrig = { defined: 'crypto' in globalScope, value: globalScope.crypto }
    delete globalScope.crypto

    try {
      const nodeCryptoAesCipher = await aesCipher.createCipher()
      t.assert(nodeCryptoAesCipher instanceof aesCipher.NodeCryptoAesCipher, 'should be type NodeCryptoAesCipher when global web crypto undefined')

      // Set global web `crypto` polyfill for testing
      const webCrypto = new webCryptoPolyfill.Crypto()
      globalScope.crypto = webCrypto
      const webCryptoAesCipher = await aesCipher.createCipher()
      t.assert(webCryptoAesCipher instanceof aesCipher.WebCryptoAesCipher, 'should be type WebCryptoAesCipher when global web crypto is available')
      
      const key128 = Buffer.from('0f'.repeat(16), 'hex')
      const key256 = Buffer.from('0f'.repeat(32), 'hex')
      const iv = Buffer.from('f7'.repeat(16), 'hex')
      const inputData = Buffer.from('TestData'.repeat(20))
      const inputDataHex = inputData.toString('hex')

      const expected128Cbc = '5aa1100a0a3133c9184dc661bc95c675a0fe5f02a67880f50702f8c88e7a445248d6dedfca80e72d00c3d277ea025eebde5940265fa00c1bfe80aebf3968b6eaf0564eda6ddd9e97548be1fa6d487e71353b11136193782d76d3b8d1895047e08a121c1706c083ceefdb9605a75a2310cccee1b0aaca632230f45f1172001cad96ae6d15db38ab9eed27b27b6f80353a5f30e3532a526a834a0f8273ffb2e9caaa92843b40c893e298f3b472fb26b11f'
      const expected128CbcBuffer = Buffer.from(expected128Cbc, 'hex')

      const expected256Cbc = '66a21fa53680d8182a79c1b90cdc38d398fe34d85c7ca5d45b8381fea4a84536e38514b3bcdba06655314607534be7ea370952ed6f334af709efc6504e600ce0b7c20fe3b469c29b63a391983b74aa12f1d859b477092c61e7814bd6c8d143ec21d34f79468c74c97ae9763ec11695e1e9a3a3b33f12561ecef9fbae79ddf7f2701c97ba1531801862662a9ce87a880934318a9e46a3941367fa68da3340f83941211aba7ec741826ff35d4f880243db'
      const expected256CbcBuffer = Buffer.from(expected256Cbc, 'hex')

      // Test aes-256-cbc encrypt
      const encrypted256NodeCrypto = (await nodeCryptoAesCipher
        .encrypt('aes-256-cbc', key256, iv, inputData)).toString('hex')
      const encrypted256WebCrypto = (await webCryptoAesCipher
        .encrypt('aes-256-cbc', key256, iv, inputData)).toString('hex')

      t.equal(expected256Cbc, encrypted256NodeCrypto, 'NodeCryptoAesCipher aes-256-cbc should have encrypted to expected ciphertext')
      t.equal(expected256Cbc, encrypted256WebCrypto, 'WebCryptoAesCipher aes-256-cbc should have encrypted to expected ciphertext')

      // Test aes-256-cbc decrypt
      const decrypted256NodeCrypto = (await nodeCryptoAesCipher
        .decrypt('aes-256-cbc', key256, iv, expected256CbcBuffer)).toString('hex')
      const decrypted256WebCrypto = (await webCryptoAesCipher
        .decrypt('aes-256-cbc', key256, iv, expected256CbcBuffer)).toString('hex')

      t.equal(inputDataHex, decrypted256NodeCrypto, 'NodeCryptoAesCipher aes-256-cbc should have decrypted to expected ciphertext')
      t.equal(inputDataHex, decrypted256WebCrypto, 'WebCryptoAesCipher aes-256-cbc should have decrypted to expected ciphertext')

      // Test aes-128-cbc encrypt
      const encrypted128NodeCrypto = (await nodeCryptoAesCipher
        .encrypt('aes-128-cbc', key128, iv, inputData)).toString('hex')
      const encrypted128WebCrypto = (await webCryptoAesCipher
        .encrypt('aes-128-cbc', key128, iv, inputData)).toString('hex')

      t.equal(expected128Cbc, encrypted128NodeCrypto, 'NodeCryptoAesCipher aes-128-cbc should have encrypted to expected ciphertext')
      t.equal(expected128Cbc, encrypted128WebCrypto, 'WebCryptoAesCipher aes-128-cbc should have encrypted to expected ciphertext')

      // Test aes-128-cbc decrypt
      const decrypted128NodeCrypto = (await nodeCryptoAesCipher
        .decrypt('aes-128-cbc', key128, iv, expected128CbcBuffer)).toString('hex')
      const decrypted128WebCrypto = (await webCryptoAesCipher
        .decrypt('aes-128-cbc', key128, iv, expected128CbcBuffer)).toString('hex')

      t.equal(inputDataHex, decrypted128NodeCrypto, 'NodeCryptoAesCipher aes-128-cbc should have decrypted to expected ciphertext')
      t.equal(inputDataHex, decrypted128WebCrypto, 'WebCryptoAesCipher aes-128-cbc should have decrypted to expected ciphertext')

    } finally {
      // Restore previous `crypto` global var
      if (globalCryptoOrig.defined) {
        globalScope.crypto = globalCryptoOrig.value
      } else {
        delete globalScope.crypto
      }
    }
  })

  test('encrypt-to-decrypt works', async (t) => {
    t.plan(2)

    const testString = 'all work and no play makes jack a dull boy'
    let cipherObj = await encryptECIES(publicKey, testString)
    let deciphered = await decryptECIES(privateKey, cipherObj)
    t.equal(deciphered, testString, 'Decrypted ciphertext does not match expected plaintext')

    const testBuffer = Buffer.from(testString)
    cipherObj = await encryptECIES(publicKey, testBuffer)
    deciphered = await decryptECIES(privateKey, cipherObj)
    t.equal(deciphered.toString('hex'), testBuffer.toString('hex'),
            'Decrypted cipherbuffer does not match expected plainbuffer')
  })

  test('encrypt-to-decrypt fails on bad mac', async (t) => {
    t.plan(3)

    const testString = 'all work and no play makes jack a dull boy'
    const cipherObj = await encryptECIES(publicKey, testString)
    const evilString = 'some work and some play makes jack a dull boy'
    const evilObj = await encryptECIES(publicKey, evilString)

    cipherObj.cipherText = evilObj.cipherText

    try {
      await decryptECIES(privateKey, cipherObj)
      t.true(false, 'Decryption should have failed when ciphertext modified')
    } catch (e) {
      t.true(true, 'Decryption correctly fails when ciphertext modified')
      t.equal(e.code, ERROR_CODES.FAILED_DECRYPTION_ERROR, 'Must have proper error code')
      const assertionMessage = 'Should indicate MAC error'
       t.notEqual(e.message.indexOf('failure in MAC check'), -1, assertionMessage)
    }
  })

  test('sign-to-verify-works', async (t) => {
    t.plan(2)

    const testString = 'all work and no play makes jack a dull boy'
    let sigObj = await signECDSA(privateKey, testString)
    t.true(await verifyECDSA(testString, sigObj.publicKey, sigObj.signature),
           'String content should be verified')

    const testBuffer = Buffer.from(testString)
    sigObj = await signECDSA(privateKey, testBuffer)
    t.true(await verifyECDSA(testBuffer, sigObj.publicKey, sigObj.signature),
           'String buffer should be verified')
  })

  test('sign-to-verify-fails', async (t) => {
    t.plan(3)

    const testString = 'all work and no play makes jack a dull boy'
    const failString = 'I should fail'

    let sigObj = await signECDSA(privateKey, testString)
    t.false(await verifyECDSA(failString, sigObj.publicKey, sigObj.signature),
            'String content should not be verified')

    const testBuffer = Buffer.from(testString)
    sigObj = await signECDSA(privateKey, testBuffer)
    t.false(await verifyECDSA(Buffer.from(failString), sigObj.publicKey, sigObj.signature),
            'Buffer content should not be verified')

    const badPK = '0288580b020800f421d746f738b221d384f098e911b81939d8c94df89e74cba776'
    sigObj = await signECDSA(privateKey, testBuffer)
    t.false(await verifyECDSA(Buffer.from(failString), badPK, sigObj.signature),
            'Buffer content should not be verified')
  })

  test('bn-padded-to-64-bytes', (t) => {
    t.plan(1)
    const ecurve = new elliptic.ec('secp256k1')

    const evilHexes = ['ba40f85b152bea8c3812da187bcfcfb0dc6e15f9e27cb073633b1c787b19472f',
                       'e346010f923f768138152d0bad063999ff1da5361a81e6e6f9106241692a0076']
    const results = evilHexes.map((hex) => {
      const ephemeralSK = ecurve.keyFromPrivate(hex)
      const ephemeralPK = ephemeralSK.getPublic()
      const sharedSecret = ephemeralSK.derive(ephemeralPK)
      return getHexFromBN(sharedSecret).length === 64
    })

    t.true(results.every(x => x), 'Evil hexes must all generate 64-len hex strings')
  })

  test('encryptMnemonic & decryptMnemonic', async (t) => {

    const rawPhrase = 'march eager husband pilot waste rely exclude taste '
      + 'twist donkey actress scene'
    const rawPassword = 'testtest'
    const encryptedPhrase = 'ffffffffffffffffffffffffffffffffca638cc39fc270e8be5c'
      + 'bf98347e42a52ee955e287ab589c571af5f7c80269295b0039e32ae13adf11bc6506f5ec'
      + '32dda2f79df4c44276359c6bac178ae393de'

    const preEncryptedPhrase = '7573f4f51089ba7ce2b95542552b7504de7305398637733'
     + '0579649dfbc9e664073ba614fac180d3dc237b21eba57f9aee5702ba819fe17a0752c4dc7'
     + '94884c9e75eb60da875f778bbc1aaca1bd373ea3'

    const legacyPhrase = 'vivid oxygen neutral wheat find thumb cigar wheel '
      + 'board kiwi portion business'
    const legacyPassword = 'supersecret'
    const legacyEncrypted = '1c94d7de0000000304d583f007c71e6e5fef354c046e8c64b1'
      + 'adebd6904dcb007a1222f07313643873455ab2a3ab3819e99d518cc7d33c18bde02494aa'
      + '74efc35a8970b2007b2fc715f6067cee27f5c92d020b1806b0444994aab80050a6732131'
      + 'd2947a51bacb3952fb9286124b3c2b3196ff7edce66dee0dbd9eb59558e0044bddb3a78f'
      + '48a66cf8d78bb46bb472bd2d5ec420c831fc384293252459524ee2d668869f33c586a944'
      + '67d0ce8671260f4cc2e87140c873b6ca79fb86c6d77d134d7beb2018845a9e71e6c7ecde'
      + 'dacd8a676f1f873c5f9c708cc6070642d44d2505aa9cdba26c50ad6f8d3e547fb0cba710'
      + 'a7f7be54ff7ea7e98a809ddee5ef85f6f259b3a17a8d8dbaac618b80fe266a1e63ec19e4'
      + '76bee9177b51894ee'

    // Test encryption -> decryption. Can't be done with hard-coded values
    // due to random salt.
    await encryptMnemonic(rawPhrase, rawPassword)
      .then(encoded => decryptMnemonic(encoded.toString('hex'), rawPassword, triplesec.decrypt),
            (err) => {
              t.fail(`Should encrypt mnemonic phrase, instead errored: ${err}`)
            })
      .then((decoded: string) => {
        t.true(decoded.toString() === rawPhrase, 'Should encrypt & decrypt a phrase correctly')
      }, (err) => {
        t.fail(`Should decrypt encrypted phrase, instead errored: ${err}`)
      })

    // Test encryption with mocked randomBytes generator to use same salt
    try {
      const mockSalt = Buffer.from('ff'.repeat(16), 'hex')
      const encoded = await encryptMnemonic(rawPhrase, rawPassword, {getRandomBytes: () => mockSalt})
      t.strictEqual(encoded.toString('hex'), encryptedPhrase)
    } catch (err) {
      t.fail(`Should have encrypted phrase with deterministic salt, instead errored: ${err}`)
    }

    // Test decryption with mocked randomBytes generator to use same salt
    try {
      const decoded = await decryptMnemonic(Buffer.from(encryptedPhrase, 'hex'), rawPassword, triplesec.decrypt)
      t.strictEqual(decoded, rawPhrase, 'Should encrypt & decrypt a phrase correctly')
    } catch (err) {
      t.fail(`Should have decrypted phrase with deterministic salt, instead errored: ${err}`)
    }

    // Test valid input (No salt, so it's the same every time)
    await decryptMnemonic(legacyEncrypted, legacyPassword, triplesec.decrypt).then((decoded) => {
      t.strictEqual(decoded, legacyPhrase, 'Should decrypt legacy encrypted phrase')
    }, (err) => {
      t.fail(`Should decrypt legacy encrypted phrase, instead errored: ${err}`)
    })

    // Invalid inputs
    await encryptMnemonic('not a mnemonic phrase', 'password').then(() => {
      t.fail('Should have thrown on invalid mnemonic input')
    }, () => {
      t.pass('Should throw on invalid mnemonic input')
    })

    await decryptMnemonic(preEncryptedPhrase, 'incorrect password', triplesec.decrypt).then(() => {
      t.fail('Should have thrown on incorrect password for decryption')
    }, () => {
      t.pass('Should throw on incorrect password')
    })
  })
}
