import axios from 'axios';
import bigInt from 'big-integer';
import CryptoJS from 'crypto-js';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

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

// 生成安全的文件名
function generateSafeFileName(name: string, artist: string, maxLength = 50): string {
  return `${name}_${artist}`
    .replace(/[^\w\s-]/g, '') // 移除特殊字符
    .replace(/\s+/g, '_') // 空格替换为下划线
    .substring(0, maxLength); // 限制长度
}

// 获取歌曲详情
async function getSongDetail(songId: number) {
  const { params, encSecKey } = weapi({
    ids: [songId],
    c: JSON.stringify([{ id: songId }]),
  });

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
}

// 获取歌曲播放URL
async function getSongUrl(songId: number, br = 320000) {
  const { params, encSecKey } = weapi({
    ids: [songId],
    br: br,
  });

  const res = await axios.post(
    'https://music.163.com/weapi/song/enhance/player/url?csrf_token=',
    `params=${encodeURIComponent(params)}&encSecKey=${encodeURIComponent(encSecKey)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://music.163.com/',
      },
    },
  );

  if (res.data.code === 200 && res.data.data && res.data.data.length > 0) {
    const songData = res.data.data[0];
    if (songData.url) {
      return {
        id: songData.id,
        url: songData.url,
        br: songData.br,
        size: songData.size,
        type: songData.type,
      };
    } else {
      throw new Error('该歌曲暂无播放权限或已下架');
    }
  } else {
    throw new Error('获取歌曲播放URL失败');
  }
}

// 获取歌词
async function getLyric(songId: number) {
  const { params, encSecKey } = weapi({ id: songId, lv: -1, tv: -1 });

  const res = await axios.post(
    'https://music.163.com/weapi/song/lyric?csrf_token=',
    `params=${encodeURIComponent(params)}&encSecKey=${encodeURIComponent(encSecKey)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://music.163.com/',
      },
    },
  );

  return res.data;
}

// 下载文件
async function downloadFile(url: string, filePath: string): Promise<number> {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://music.163.com/',
    },
  });

  // 确保目录存在
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      const stats = fs.statSync(filePath);
      resolve(stats.size);
    });
    writer.on('error', reject);
  });
}

export async function POST(request: NextRequest) {
  try {
    const { songId, options, quality } = await request.json();

    if (!songId || typeof songId !== 'number') {
      return NextResponse.json({ error: '无效的歌曲ID' }, { status: 400 });
    }

    // 获取歌曲详情
    const songDetail = await getSongDetail(songId);
    const safeFileName = generateSafeFileName(songDetail.name, songDetail.artist);

    const results: any = {};

    // 下载歌曲
    if (options.song) {
      try {
        const songUrlData = await getSongUrl(songId, quality);
        const songPath = path.join(
          process.cwd(),
          'public',
          'downloads',
          'songs',
          `${safeFileName}.${songUrlData.type}`,
        );
        const size = await downloadFile(songUrlData.url, songPath);

        results.song = {
          filePath: `/downloads/songs/${safeFileName}.${songUrlData.type}`,
          size: size,
          br: songUrlData.br,
        };
      } catch (error) {
        console.error('下载歌曲失败:', error);
        throw new Error('下载歌曲失败');
      }
    }

    // 下载封面
    if (options.cover) {
      try {
        const coverPath = path.join(
          process.cwd(),
          'public',
          'downloads',
          'covers',
          `${safeFileName}.jpg`,
        );
        await downloadFile(songDetail.coverUrl, coverPath);

        results.cover = {
          filePath: `/downloads/covers/${safeFileName}.jpg`,
        };
      } catch (error) {
        console.error('下载封面失败:', error);
        throw new Error('下载封面失败');
      }
    }

    // 获取歌词
    if (options.lyrics) {
      try {
        const lyricData = await getLyric(songId);
        results.lyrics = {
          content: lyricData,
        };
      } catch (error) {
        console.error('获取歌词失败:', error);
        throw new Error('获取歌词失败');
      }
    }

    return NextResponse.json({
      songDetail,
      results,
    });
  } catch (error) {
    console.error('Download API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '下载失败' },
      { status: 500 },
    );
  }
}
