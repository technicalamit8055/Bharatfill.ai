/**
 * UIDAI's public keys for checking the digital signature on an Aadhaar Secure QR code.
 *
 * GENERATED — do not edit by hand. Each entry is the RSA-2048 public key (exponent 65537) of a
 * certificate UIDAI publishes on https://uidai.gov.in/en/data-and-download ("Offline e-KYC public
 * key certificates": "for validating the digital signature of Aadhaar Paperless Offline e-KYC and
 * Secure QR Code"), downloaded from backend.uidai.gov.in on 2026-11-26. `certSha256` is the
 * SHA-256 fingerprint of the certificate file, so anyone can re-download it and compare.
 *
 * Expired keys stay: a QR printed in 2019 was signed with the key UIDAI used then, and is no less
 * genuine for it. A signature that matches none of these is reported as "not confirmed", never as
 * fake — UIDAI may sign with a newer key than this list knows. To add one, download the new
 * certificate from the page above and append its key here with the same fields.
 */

export type UidaiKey = {
  /** The certificate file's name on the UIDAI page. */
  readonly file: string;
  /** The certificate's subject common name. */
  readonly commonName: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly certSha256: string;
  /** RSA modulus, big-endian hex. The exponent is always 65537. */
  readonly modulusHex: string;
};

export const UIDAI_KEYS: readonly UidaiKey[] = [
  {
    file: 'uidai_offline_publickey_2026.cer',
    commonName: 'DS Unique Identification Authority of India 06',
    validFrom: '2026-02-03',
    validTo: '2029-02-03',
    certSha256: 'e0304b9e61ee3640ecddae2db4b617f2e2678f57dbc2826c2f86ac5c04f277df',
    modulusHex:
      '875fb3627bdb7049b4633ef7b39bb8da876950932bf70bf96d5c3bb0e1399c535bac1f94fbee48d1ff1c2f61' +
      'e81e724e930bcb673ac3d231bfbf100a8babe28bf82313350482b91d207c4c3f70fa189b343124078845ef20' +
      '63b03c81f704bb4139cde6dbc355353e90f62ab4814c2ec67961577f1474d842965a8d6215a600c3c99089a0' +
      '68aad166f636a5636cea077e3e5005ffd48eebdc77fb599e03c90f93666f41a9d9971f6d7da13178e7bda2bd' +
      'cd4222b2dbe51bb57ae972801f61b6d68b5394cd78b96c97616c6a76dfd7357d7e942b250ce4850c63e9b723' +
      'bc2ed9643b96678eda7fefc33433fcf2875cf598bb76f275630b7428b4eef39006acc22b',
  },
  {
    file: 'uidai_offline_publickey_17022026.cer',
    commonName: 'DS Unique Identification Authority of India 05',
    validFrom: '2024-02-21',
    validTo: '2026-02-16',
    certSha256: '00573c692cf04fbee113ae5fd52f2a654d361bf8ee4d06c46008906b36df8169',
    modulusHex:
      '98c2092a3dbc25c4cdd41ef6a76fe98330c2a20ba1b3fadb21780dff26cd361d0d54ead95762a596b993e553' +
      '9894cac0069bc8a7b254fe7ea199adff3b5e27ee7be7809ff2ddca2587cae4ee6b03c1500eed9b950fe182cd' +
      'f6983cb2e4512fb0a87eccec5387227fe9c89a35464c66f7c94edddca8c7946e2c6d94aa6ec97d52289a6d2d' +
      'ed0289a0ce6b7fc24dbcf5ddc2cc4df3d796953d817fb045fff1b714a885ed91dfbc8cb2aad7bfde8ad1446f' +
      'ccf3442a2eb0cfd5121e39ae776538082d773240e6f6c993aa347de2376b92291b2eb0d3b5ed3a3914e6f627' +
      'd1dde7020cb83bf7cf0e0c593aca016b936289fdd1049e1912afd5de4040d46dd31e5d4b',
  },
  {
    file: 'uidai_offline_publickey_26022021.cer',
    commonName: 'DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 05',
    validFrom: '2021-02-26',
    validTo: '2024-02-27',
    certSha256: 'e0f0f869d32efc7e80fae2223717a56dcf8b616f820b542a49e5bd5abf1c0f7d',
    modulusHex:
      'a2722c0e5f2de5ba707ed93f036ec2b1f0b955932390facc0f0bcbf20c80a15c088b4886866b72eb25ab0bf5' +
      '5a2fe06b69edbd5cc83b74c7709db2141e6c07c68bcdf859d3daf7f3fced241d072055dc15488474b45c2c98' +
      '2fa954aa52aa6fffb2481861c65085d84b64158e9f43d9f35ca69b48ce9300522102a4cae093bffd474b08d3' +
      '2d1d0406f687f7e55bd226a2384bf58a41c384c3974f1c7c5115819c926de3adf3ecbb9904c486f1f5d53039' +
      '77bea63584367329b5c168afdc95121731f7f48d43af7cf31f69b1e3bbe7949dc7a8b10c0bddebababdebea0' +
      '76a1cf8166adf06a8a41dedf143bff835dbd2bd5bb0b61d2472c234a6d4411bc9b536095',
  },
  {
    file: 'uidai_offline_publickey_29032019.cer',
    commonName: 'DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 04',
    validFrom: '2019-03-15',
    validTo: '2021-02-28',
    certSha256: 'e0f5596d2c48e19f9cc184bccde7129e2d8987f905c73b87d1851c35c622d852',
    modulusHex:
      '9b76a38dcdce4214e43fdd829e66048d7030546d0a139007bba7b9865c75b76ce9eb2b3da4e565cd54cb7511' +
      '568f7c8b45b49e3deef97b65137add09502ada17bfcdad7b0044fca30e855c4d39728fe24470e608ed553083' +
      'd7b7e57a78ec00cdb28e87cc7846d4527d0ccca558c3fb7b0a1bfd9d0b9dba75338658193044fdb670adf391' +
      '9998e5f192b3131776bb34831aef6a717d01e9b08bbf1970292a1b7c2b5381622864fd3af8770ab89e7bd1f8' +
      'ba67c5bb7a96cbfce3dff7678a532cb7f56d3429971eb87146a27c212c217fe2deda3324aba557fae7095af1' +
      'd3b636f5f295647257b8faad1e839d448541948e819b89c8fc4c2d2ddf13320439df3659',
  },
  {
    file: 'uidai_12_06_18_cer.cer',
    commonName: 'DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 7',
    validFrom: '2018-06-08',
    validTo: '2021-06-07',
    certSha256: '49e298532243ce28e2633a7e4f403d9ca78cbfda8b3bbde70324837273ba4d31',
    modulusHex:
      'bf50d22bdfeaad6f115f5bc364cb04f318a2c89963fbac710edbbe9d26435bd0bf89a8d2a89d9080bbd18307' +
      '93c38b2ecf3c5942c78e13e91baa56deb0d1dcd25423b7d4fe08662b51309b308fdadf365baf7bcfc73dd594' +
      'dee2aabf14e88494379df1fbaa8073867f3dceba22a240eb35c13ca1598871cc9a2d3478cd781e0356acb124' +
      '60713981e06606011ebf39ec912e10fac2555fee2c789ff369d737e4ee06ea0bd665ab65b01e524c649d7ace' +
      '13a85d64d055786b4085eef033a5403812d428865e9d9ca5a97d6600254c5b4ab1f53822c5067d4005ef58c3' +
      '989990830561aba1c85ccfd7a5c2886f754cfa0e44827cb2c211f6e7f6d68eab0fcd8e27',
  },
  {
    file: 'uidai_prod_cdup.cer',
    commonName: 'DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 4',
    validFrom: '2017-06-08',
    validTo: '2020-06-07',
    certSha256: 'fcf31a3f89211615ebd5d449ac33d8d381f654d2e2d15037d5cc8d4aeb72f836',
    modulusHex:
      'bf41e36c5a6fbbf911fa04c8dbeb2f18d996e1e6478535411bf37e6f26aadc61f448333e8cee515b805b5cdc' +
      'da48a734239988c8dd6f41fd8a98d57fdd76a2e8ca248a266b0517ccf1ae3def308cb5e1d303348fd4bd039a' +
      '8854b81421fecd617ea448216a5f12eee7a16d86f2da0ad1939047513416d8a758db6a11ebb194d10a81fc64' +
      '378fef47382f185c3e3cf7281b9b8c75c77bfc38c31358b6d33993fb9e4380806b9de0b0ad6ee720cd0c7770' +
      '4f39357c881c338dd55c7431e132d4a98bd50a507c3cd2c0d1669ef2801e19d109a14b108c0a0f60eca3c761' +
      '8f8f5510b6b05ade6410baaed9882fe1cc50f7224420aa3192f1ddfeb14520fdee566bff',
  },
  {
    file: 'uidai_offline_publickey_26022019.cer',
    commonName: 'DS UNIQUE IDENTIFICATION AUTHORITY OF INDIA 03',
    validFrom: '2017-04-27',
    validTo: '2019-04-09',
    certSha256: '35575c63c72106e803511004f94bfda54952b2cf2184c3ce1aad61f1964c58d0',
    modulusHex:
      'bd553dbf0a5f8b9430ffb29ba85790588bbe9a8adafe6c8607676bbed620f98594ec67e95e14d879e02f6979' +
      '5f162af58cfa0840b5e050867743a0873c45db01d753dff905ded1c867a03546b159af64fed1526993a4008f' +
      'c918c323b0530673bd016b2935795ef1fc0962c6882cbb7ec301a30a8da6837e941543d66be735c90e110d96' +
      'b5c58c9f99314561aa0023d14266e2a1913a14f269d196b13bce310379794cfe7dd2a5e3f46d9ffeac5a366b' +
      '949b8fcff12f93ea0c6166559f055787f5a976311efb55e74e172466e3e0183d4cc7a18ee755b240748c4e18' +
      '0ec73b4c1c1c3c8c39e29602c0aec4b704d560921272de0e26bf276d50096aca0819d71f',
  },
];
