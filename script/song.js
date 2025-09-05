import axios from 'axios';
import bigInt from 'big-integer';
import CryptoJS from 'crypto-js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { URL } from 'url';

// =================================
// 常量配置
// =================================

// AES + RSA 加密参数
const pubKey = '010001';
const modulus =
  '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'; // 网易云 weapi 公共 modulus
const nonce = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';

// =================================
// 加密工具函数
// =================================

// 随机生成 16 位字符串
function randomString(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let str = '';
  for (let i = 0; i < len; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return str;
}

// AES 加密
function aesEncrypt(text, secKey) {
  const enc = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(secKey), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return enc.toString();
}

// RSA 加密
function rsaEncrypt(secKey) {
  const reversed = secKey.split('').reverse().join('');
  const hex = Buffer.from(reversed).toString('hex');
  const biText = bigInt(hex, 16);
  const biEx = bigInt(pubKey, 16);
  const biMod = bigInt(modulus, 16);
  const biRet = biText.modPow(biEx, biMod);
  return biRet.toString(16).padStart(256, '0');
}

// 生成 params 和 encSecKey
function weapi(data) {
  const text = JSON.stringify(data);
  const secKey = randomString(16);
  const encText = aesEncrypt(aesEncrypt(text, nonce), secKey);
  const encSecKey = rsaEncrypt(secKey);
  return { params: encText, encSecKey };
}

// =================================
// URL 解析工具
// =================================

// 从网易云音乐链接中提取歌曲ID
function extractSongIdFromUrl(urlString) {
  try {
    // 处理各种可能的URL格式
    let cleanUrl = urlString.trim();

    // 移除可能的锚点标记
    if (cleanUrl.includes('#/')) {
      cleanUrl = cleanUrl.replace('#/', '');
    }

    const url = new URL(cleanUrl);

    // 从URL参数中获取id
    const songId = url.searchParams.get('id');

    if (!songId) {
      throw new Error('无法从URL中提取歌曲ID');
    }

    return parseInt(songId, 10);
  } catch (error) {
    // 尝试用正则表达式匹配
    const match = urlString.match(/[?&]id=(\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }

    throw new Error(`无效的网易云音乐链接: ${error.message}`);
  }
}

// 验证是否为网易云音乐链接
function isNetEaseMusicUrl(urlString) {
  return urlString.includes('music.163.com') && urlString.includes('song');
}

// =================================
// 网易云音乐 API 接口
// =================================

// 调用歌词接口
async function getLyric(songId) {
  const { params, encSecKey } = weapi({ id: songId, lv: -1, tv: -1 });
  try {
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
  } catch (err) {
    console.error('获取歌词失败:', err.message);
    throw err;
  }
}

// 获取歌曲详情（包含封面信息）
async function getSongDetail(songId) {
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
        artist: song.ar.map((a) => a.name).join(' & '),
        album: song.al.name,
        coverUrl: song.al.picUrl, // 封面URL
        duration: song.dt,
      };
    } else {
      throw new Error('获取歌曲详情失败');
    }
  } catch (err) {
    console.error('获取歌曲详情失败:', err.message);
    throw err;
  }
}

// 获取歌曲播放URL
async function getSongUrl(songId, br = 320000) {
  const { params, encSecKey } = weapi({
    ids: [songId],
    br: br, // 比特率：128000, 192000, 320000, 999000
  });

  try {
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
  } catch (err) {
    console.error('获取歌曲播放URL失败:', err.message);
    throw err;
  }
}

// 下载歌曲封面
async function downloadCover(coverUrl, fileName = 'cover.jpg', outputDir = './covers') {
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 发送请求下载图片
    const response = await axios({
      method: 'GET',
      url: coverUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://music.163.com/',
      },
    });

    // 构建完整的文件路径
    const filePath = path.join(outputDir, fileName);

    // 创建写入流
    const writer = fs.createWriteStream(filePath);

    // 将响应数据管道到文件
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`封面下载成功: ${filePath}`);
        resolve(filePath);
      });
      writer.on('error', (err) => {
        console.error('封面下载失败:', err.message);
        reject(err);
      });
    });
  } catch (error) {
    console.error('下载封面时出错:', error.message);
    throw error;
  }
}

// =================================
// 文件工具函数
// =================================

// 从完整URL中提取文件扩展名
function getFileExtension(url) {
  const urlWithoutParams = url.split('?')[0];
  const extension = path.extname(urlWithoutParams);
  return extension || '.jpg';
}

// 生成安全的文件名
function generateSafeFileName(name, artist, maxLength = 50) {
  return `${name}_${artist}`
    .replace(/[^\w\s-]/g, '') // 移除特殊字符
    .replace(/\s+/g, '_') // 空格替换为下划线
    .substring(0, maxLength); // 限制长度
}

// 下载歌曲音频文件
async function downloadSong(songUrl, fileName, outputDir = './songs') {
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 发送请求下载音频文件
    const response = await axios({
      method: 'GET',
      url: songUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://music.163.com/',
        Range: 'bytes=0-', // 支持断点续传
      },
    });

    // 构建完整的文件路径
    const filePath = path.join(outputDir, fileName);

    // 创建写入流
    const writer = fs.createWriteStream(filePath);

    // 显示下载进度
    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;

    response.data.on('data', (chunk) => {
      downloadedSize += chunk.length;
      if (totalSize) {
        const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
        process.stdout.write(
          `\r下载进度: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(2)}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB)`,
        );
      }
    });

    // 将响应数据管道到文件
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`\n歌曲下载成功: ${filePath}`);
        resolve(filePath);
      });
      writer.on('error', (err) => {
        console.error('\n歌曲下载失败:', err.message);
        reject(err);
      });
    });
  } catch (error) {
    console.error('下载歌曲时出错:', error.message);
    throw error;
  }
}

// 通过歌曲ID下载封面
async function downloadCoverBySongId(songId, outputDir = './covers') {
  try {
    console.log(`正在获取歌曲 ${songId} 的详情...`);

    // 获取歌曲详情
    const songDetail = await getSongDetail(songId);

    console.log(`歌曲信息:`);
    console.log(`- 名称: ${songDetail.name}`);
    console.log(`- 艺术家: ${songDetail.artist}`);
    console.log(`- 专辑: ${songDetail.album}`);
    console.log(`- 封面URL: ${songDetail.coverUrl}`);

    // 生成文件名
    const safeFileName = generateSafeFileName(songDetail.name, songDetail.artist);

    const extension = getFileExtension(songDetail.coverUrl);
    const fileName = `${safeFileName}${extension}`;

    console.log(`正在下载封面: ${fileName}`);

    // 下载封面
    const filePath = await downloadCover(songDetail.coverUrl, fileName, outputDir);

    return {
      songDetail,
      filePath,
    };
  } catch (error) {
    console.error(`通过歌曲ID ${songId} 下载封面失败:`, error.message);
    throw error;
  }
}

// 通过歌曲ID下载歌曲
async function downloadSongBySongId(songId, br = 320000, outputDir = './songs') {
  try {
    console.log(`正在获取歌曲 ${songId} 的详情和播放链接...`);

    // 并行获取歌曲详情和播放URL
    const [songDetail, songUrlData] = await Promise.all([
      getSongDetail(songId),
      getSongUrl(songId, br),
    ]);

    console.log(`歌曲信息:`);
    console.log(`- 名称: ${songDetail.name}`);
    console.log(`- 艺术家: ${songDetail.artist}`);
    console.log(`- 专辑: ${songDetail.album}`);
    console.log(`- 比特率: ${songUrlData.br}kbps`);
    console.log(`- 文件大小: ${(songUrlData.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`- 文件类型: ${songUrlData.type}`);

    // 生成安全的文件名
    const safeFileName = generateSafeFileName(songDetail.name, songDetail.artist);

    const fileName = `${safeFileName}.${songUrlData.type}`;

    console.log(`正在下载歌曲: ${fileName}`);

    // 下载歌曲
    const filePath = await downloadSong(songUrlData.url, fileName, outputDir);

    return {
      songDetail,
      songUrlData,
      filePath,
    };
  } catch (error) {
    console.error(`通过歌曲ID ${songId} 下载歌曲失败:`, error.message);
    throw error;
  }
}

// 通过歌曲ID同时下载歌曲和封面
async function downloadSongAndCover(
  songId,
  br = 320000,
  songsDir = './songs',
  coversDir = './covers',
) {
  try {
    console.log(`开始下载歌曲 ${songId} 及其封面...`);

    // 并行下载歌曲和封面
    const [songResult, coverResult] = await Promise.all([
      downloadSongBySongId(songId, br, songsDir),
      downloadCoverBySongId(songId, coversDir),
    ]);

    console.log('\n=== 下载完成 ===');
    console.log(`歌曲文件: ${songResult.filePath}`);
    console.log(`封面文件: ${coverResult.filePath}`);

    return {
      song: songResult,
      cover: coverResult,
    };
  } catch (error) {
    console.error(`下载歌曲和封面失败:`, error.message);
    throw error;
  }
}

// =================================
// 命令行交互界面
// =================================

// 创建readline接口
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

// 显示欢迎信息
function showWelcome() {
  console.log('\n=================================');
  console.log('🎵 网易云音乐下载工具');
  console.log('=================================');
  console.log('支持功能:');
  console.log('• 通过网易云音乐链接下载歌曲和封面');
  console.log('• 支持多种音质选择');
  console.log('• 自动生成安全文件名');
  console.log('=================================\n');
}

// 显示菜单
function showMenu() {
  console.log('\n请选择操作:');
  console.log('1. 下载歌曲和封面');
  console.log('2. 仅下载歌曲');
  console.log('3. 仅下载封面');
  console.log('4. 获取歌词');
  console.log('5. 退出');
  console.log('=================================');
}

// 获取用户输入
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 处理URL输入并执行相应操作
async function handleUserInput(rl, choice) {
  try {
    const urlInput = await askQuestion(rl, '\n请输入网易云音乐歌曲链接: ');

    if (!urlInput) {
      console.log('❌ 链接不能为空!');
      return;
    }

    if (!isNetEaseMusicUrl(urlInput)) {
      console.log('❌ 请输入有效的网易云音乐歌曲链接!');
      return;
    }

    const songId = extractSongIdFromUrl(urlInput);
    console.log(`\n✅ 解析到歌曲ID: ${songId}`);

    let br = 320000; // 默认音质

    if (choice === '1' || choice === '2') {
      const brInput = await askQuestion(rl, '\n请选择音质 (128/192/320/999, 默认320): ');
      if (brInput) {
        const brMap = {
          128: 128000,
          192: 192000,
          320: 320000,
          999: 999000,
        };
        br = brMap[brInput] || 320000;
      }
    }

    console.log('\n🚀 开始处理...');

    switch (choice) {
      case '1':
        await downloadSongAndCover(songId, br);
        break;
      case '2':
        await downloadSongBySongId(songId, br);
        break;
      case '3':
        await downloadCoverBySongId(songId);
        break;
      case '4':
        const lyricData = await getLyric(songId);
        console.log('\n📝 歌词信息:');
        console.log(JSON.stringify(lyricData, null, 2));
        break;
      default:
        console.log('❌ 无效的选择!');
        return;
    }

    console.log('\n✅ 操作完成!');
  } catch (error) {
    console.error('\n❌ 操作失败:', error.message);
  }
}

// 主函数 - 命令行交互
async function main() {
  const rl = createReadlineInterface();

  showWelcome();

  try {
    while (true) {
      showMenu();
      const choice = await askQuestion(rl, '请输入选项 (1-5): ');

      if (choice === '5') {
        console.log('\n👋 感谢使用，再见!');
        break;
      }

      if (!['1', '2', '3', '4'].includes(choice)) {
        console.log('❌ 无效的选择，请输入 1-5 之间的数字!');
        continue;
      }

      await handleUserInput(rl, choice);

      const continueChoice = await askQuestion(rl, '\n是否继续操作? (y/n): ');
      if (
        continueChoice.toLowerCase() !== 'y' &&
        continueChoice.toLowerCase() !== 'yes'
      ) {
        console.log('\n👋 感谢使用，再见!');
        break;
      }
    }
  } catch (error) {
    console.error('程序运行出错:', error.message);
  } finally {
    rl.close();
  }
}

// =================================
// 测试函数 (开发用)
// =================================

// 快速测试函数
async function quickTest() {
  const testUrl = 'https://music.163.com/#/song?id=2147712523&userid=320620245';

  try {
    console.log('🧪 开始快速测试...');
    const songId = extractSongIdFromUrl(testUrl);
    console.log(`✅ 解析歌曲ID: ${songId}`);

    const result = await downloadSongAndCover(songId);
    console.log('✅ 测试完成!');
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 启动程序
if (process.argv[2] === '--test') {
  quickTest();
} else {
  main();
}
