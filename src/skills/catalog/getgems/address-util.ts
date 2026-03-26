/** Convert raw TON address (0:hex) to friendly bounceable base64url (EQ...) */
export function rawToFriendly(raw: string): string {
  const [wcStr, hexHash] = raw.split(':');
  const wc = parseInt(wcStr, 10);
  const hash = Buffer.from(hexHash, 'hex');

  const payload = Buffer.alloc(34);
  payload[0] = 0x11; // bounceable tag
  payload[1] = wc & 0xff;
  hash.copy(payload, 2);

  // CRC16-CCITT (0xFFFF)
  let crc = 0xffff;
  for (let i = 0; i < 34; i++) {
    crc ^= payload[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }

  const addr = Buffer.alloc(36);
  payload.copy(addr);
  addr[34] = (crc >> 8) & 0xff;
  addr[35] = crc & 0xff;

  return addr
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
