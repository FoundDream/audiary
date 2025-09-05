'use client';

import {
  AlertCircle,
  CheckCircle,
  FileText,
  Image as ImageIcon,
  Loader2,
  Music,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

interface DownloadMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SongDetail {
  id: number;
  name: string;
  artist: string;
  album: string;
  coverUrl: string;
  duration: number;
}

interface DownloadProgress {
  type: 'song' | 'cover' | 'lyrics';
  progress: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  fileName?: string;
  error?: string;
}

interface DownloadResult {
  songDetail: SongDetail;
  results: {
    song?: { filePath: string; size: number; br: number };
    cover?: { filePath: string };
    lyrics?: { content: string };
  };
}

const QUALITY_OPTIONS = [
  { label: '128kbps (较小文件)', value: 128000 },
  { label: '192kbps (平衡)', value: 192000 },
  { label: '320kbps (高音质)', value: 320000 },
];

export default function DownloadMusicModal({ isOpen, onClose }: DownloadMusicModalProps) {
  const [url, setUrl] = useState('');
  const [selectedOptions, setSelectedOptions] = useState({
    song: true,
    cover: true,
    lyrics: false,
  });
  const [quality, setQuality] = useState(320000);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress[]>([]);
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null);
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'input' | 'preview' | 'downloading' | 'completed'>(
    'input',
  );

  // 重置状态
  const resetState = () => {
    setUrl('');
    setSelectedOptions({ song: true, cover: true, lyrics: false });
    setQuality(320000);
    setIsLoading(false);
    setDownloadProgress([]);
    setSongDetail(null);
    setDownloadResult(null);
    setError(null);
    setStep('input');
  };

  // 关闭模态框
  const handleClose = () => {
    resetState();
    onClose();
  };

  // 验证URL
  const isValidNetEaseUrl = (urlString: string) => {
    return urlString.includes('music.163.com') && urlString.includes('song');
  };

  // 提取歌曲ID
  const extractSongId = (urlString: string): number | null => {
    try {
      let cleanUrl = urlString.trim();
      if (cleanUrl.includes('#/')) {
        cleanUrl = cleanUrl.replace('#/', '');
      }
      const url = new URL(cleanUrl);
      const songId = url.searchParams.get('id');
      return songId ? parseInt(songId, 10) : null;
    } catch (error) {
      console.error(error);
      const match = urlString.match(/[?&]id=(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    }
  };

  // 获取歌曲详情（预览）
  const handlePreview = async () => {
    if (!url.trim()) {
      setError('请输入网易云音乐链接');
      return;
    }

    if (!isValidNetEaseUrl(url)) {
      setError('请输入有效的网易云音乐歌曲链接');
      return;
    }

    const songId = extractSongId(url);
    if (!songId) {
      setError('无法从链接中提取歌曲ID');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 这里调用后端API获取歌曲详情
      const response = await fetch('/api/music/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ songId }),
      });

      if (!response.ok) {
        throw new Error('获取歌曲信息失败');
      }

      const detail = await response.json();
      setSongDetail(detail);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取歌曲信息失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 开始下载
  const handleDownload = async () => {
    if (!songDetail) return;

    setStep('downloading');
    setIsLoading(true);
    setError(null);

    // 初始化进度状态
    const progressItems: DownloadProgress[] = [];
    if (selectedOptions.song) {
      progressItems.push({ type: 'song', progress: 0, status: 'pending' });
    }
    if (selectedOptions.cover) {
      progressItems.push({ type: 'cover', progress: 0, status: 'pending' });
    }
    if (selectedOptions.lyrics) {
      progressItems.push({ type: 'lyrics', progress: 0, status: 'pending' });
    }
    setDownloadProgress(progressItems);

    try {
      // 调用后端API开始下载
      const response = await fetch('/api/music/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          songId: songDetail.id,
          options: selectedOptions,
          quality,
        }),
      });

      if (!response.ok) {
        throw new Error('下载失败');
      }

      // 这里可以使用 Server-Sent Events 或 WebSocket 来实时更新进度
      // 简化版本：直接获取结果
      const result = await response.json();
      setDownloadResult(result);

      // 更新所有项目为完成状态
      setDownloadProgress((prev) =>
        prev.map((item) => ({ ...item, progress: 100, status: 'completed' as const })),
      );

      setStep('completed');
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
      setDownloadProgress((prev) =>
        prev.map((item) => ({ ...item, status: 'error' as const, error: '下载失败' })),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 处理选项变更
  const handleOptionChange = (option: keyof typeof selectedOptions) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  // 渲染进度条
  const renderProgress = (item: DownloadProgress) => {
    const getIcon = () => {
      switch (item.type) {
        case 'song':
          return <Music className="w-4 h-4" />;
        case 'cover':
          return <ImageIcon className="w-4 h-4" />;
        case 'lyrics':
          return <FileText className="w-4 h-4" />;
      }
    };

    const getStatusIcon = () => {
      switch (item.status) {
        case 'pending':
          return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
        case 'downloading':
          return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
        case 'completed':
          return <CheckCircle className="w-4 h-4 text-green-500" />;
        case 'error':
          return <AlertCircle className="w-4 h-4 text-red-500" />;
      }
    };

    const getTypeLabel = () => {
      switch (item.type) {
        case 'song':
          return '歌曲文件';
        case 'cover':
          return '专辑封面';
        case 'lyrics':
          return '歌词文件';
      }
    };

    return (
      <div key={item.type} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 flex-1">
          {getIcon()}
          <span className="text-sm font-medium">{getTypeLabel()}</span>
        </div>
        <div className="flex items-center gap-2">
          {item.status === 'downloading' && (
            <div className="w-16 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}
          {getStatusIcon()}
        </div>
        {item.error && <span className="text-xs text-red-500">{item.error}</span>}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <h2 className="text-lg font-bold text-gray-900">DOWNLOAD MUSIC</h2>
          <button onClick={handleClose} className="cursor-pointer">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 py-2 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Step 1: Input Link */}
          {step === 'input' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  NetEase Music Link
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://music.163.com/#/song?id=..."
                    className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <button
                onClick={handlePreview}
                disabled={isLoading || !url.trim()}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 px-4 font-medium transition-colors flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Getting...
                  </>
                ) : (
                  'Go!'
                )}
              </button>
            </div>
          )}

          {/* Step 2: Preview and Options */}
          {step === 'preview' && songDetail && (
            <div className="space-y-2">
              {/* Song Info */}
              <div className="flex items-center gap-4">
                <Image
                  src={songDetail.coverUrl}
                  alt={songDetail.name}
                  className="w-16 h-16 object-cover"
                />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{songDetail.name}</h3>
                  <p className="text-sm text-gray-600">{songDetail.artist}</p>
                  <p className="text-xs text-gray-500">{songDetail.album}</p>
                </div>
              </div>

              {/* Download Options */}
              <div>
                <div className="space-y-2">
                  {[
                    { key: 'song' as const, label: 'Song File', icon: Music },
                    { key: 'cover' as const, label: 'Album Cover', icon: ImageIcon },
                    { key: 'lyrics' as const, label: 'Lyrics File', icon: FileText },
                  ].map(({ key, label, icon: Icon }) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedOptions[key]}
                        onChange={() => handleOptionChange(key)}
                        className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                      />
                      <Icon className="w-4 h-4 text-gray-600" />
                      <span className="text-sm font-medium text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Quality Selection */}
              {selectedOptions.song && (
                <div className="mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">Quality Selection</h4>
                  <select
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  >
                    {QUALITY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!Object.values(selectedOptions).some(Boolean)}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-3 px-4 font-medium transition-colors"
                >
                  Download
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Downloading */}
          {step === 'downloading' && (
            <div className="space-y-6">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
                <h3 className="font-semibold text-gray-900">Downloading...</h3>
                <p className="text-sm text-gray-600">
                  Please wait, we are processing your request
                </p>
              </div>

              <div className="space-y-3">{downloadProgress.map(renderProgress)}</div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{error}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Completed */}
          {step === 'completed' && downloadResult && (
            <div className="space-y-6">
              <div className="text-center">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Download Completed!
                </h3>
                <p className="text-sm text-gray-600">Files have been saved to local</p>
              </div>

              {/* Download Result */}
              <div className="space-y-3">
                {downloadResult.results.song && (
                  <div className="flex items-center gap-3 p-3 bg-green-50">
                    <Music className="w-4 h-4 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Song File</p>
                      <p className="text-xs text-green-600">
                        {downloadResult.results.song.filePath} (
                        {(downloadResult.results.song.size / 1024 / 1024).toFixed(2)}MB)
                      </p>
                    </div>
                  </div>
                )}

                {downloadResult.results.cover && (
                  <div className="flex items-center gap-3 p-3 bg-green-50">
                    <ImageIcon className="w-4 h-4 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Album Cover</p>
                      <p className="text-xs text-green-600">
                        {downloadResult.results.cover.filePath}
                      </p>
                    </div>
                  </div>
                )}

                {downloadResult.results.lyrics && (
                  <div className="flex items-center gap-3 p-3 bg-green-50">
                    <FileText className="w-4 h-4 text-green-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-green-800">Lyrics File</p>
                      <p className="text-xs text-green-600">Lyrics Content</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={resetState}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 font-medium transition-colors"
                >
                  Continue Download
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 font-medium transition-colors"
                >
                  Complete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
