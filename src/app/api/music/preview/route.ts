import axios from 'axios';
import bigInt from 'big-integer';
import CryptoJS from 'crypto-js';
import { NextRequest, NextResponse } from 'next/server';

// 网易云音乐加密参数
const pubKey = '010001';
const modulus =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
const nonce = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';

// 工具函数
function randomString(len: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let str = '';
  for (let i = 0; i < len; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

function aesEncrypt(text: string, secKey: string): string {
  const enc = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(secKey), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return enc.toString();
}

function rsaEncrypt(secKey: string): string {
  const reversed = secKey.split('').reverse().join('');
  const hex = Buffer.from(reversed).toString('hex');
  const biText = bigInt(hex, 16);
  const biEx = bigInt(pubKey, 16);
  const biMod = bigInt(modulus, 16);
  const biRet = biText.modPow(biEx, biMod);
  return biRet.toString(16).padStart(256, '0');
}

function weapi(data: any) {
  const text = JSON.stringify(data);
  const secKey = randomString(16);
  const encText = aesEncrypt(aesEncrypt(text, nonce), secKey);
  const encSecKey = rsaEncrypt(secKey);
  return { params: encText, encSecKey };
}

// 获取歌曲详情
async function getSongDetail(songId: number) {
  const { params, encSecKey } = weapi({
    ids: [songId],
    c: JSON.stringify([{ id: songId }]),
  });

  try {
    const res = await axios.post(
      'https://music.163.com/weapi/v3/song/detail?csrf_token=',
      `params=${encodeURIComponent(params)}&encSecKey=${encodeURIComponent(encSecKey)}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          Referer: 'https://music.163.com/',
        },
      },
    );

    if (res.data.code === 200 && res.data.songs && res.data.songs.length > 0) {
      const song = res.data.songs[0];
      return {
        id: song.id,
        name: song.name,
        artist: song.ar.map((a: any) => a.name).join(' & '),
        album: song.al.name,
        coverUrl: song.al.picUrl,
        duration: song.dt,
      };
    } else {
      throw new Error('获取歌曲详情失败');
    }
  } catch (err) {
    console.error('获取歌曲详情失败:', err);
    throw new Error('获取歌曲详情失败');
  }
}

export async function POST(request: NextRequest) {
  try {
    const { songId } = await request.json();

    if (!songId || typeof songId !== 'number') {
      return NextResponse.json({ error: '无效的歌曲ID' }, { status: 400 });
    }

    const songDetail = await getSongDetail(songId);

    return NextResponse.json(songDetail);
  } catch (error) {
    console.error('Preview API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取歌曲信息失败' },
      { status: 500 },
    );
  }
}
