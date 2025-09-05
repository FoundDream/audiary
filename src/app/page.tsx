'use client';

import DownloadMusicModal from '@/components/DownloadMusicModal';
import { musicLibrary } from '@/data/musicLibrary';
import { Download } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [showDownload, setShowDownload] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  useEffect(() => {
    if (window.location.search.includes('download')) {
      const isDownload = window.location.search.split('=')[1];
      if (isDownload === 'true') {
        setShowDownload(true);
      }
    }
  }, []);

  // Get current date
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentDay = currentDate.getDate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-yellow-100 relative">
      <div className="p-4 px-12">
        <div className="text-right mb-4">
          <div className="text-3xl font-bold text-black">
            {currentMonth.toString().padStart(2, '0')}
          </div>
          <div className="text-black/60">/{currentDay.toString().padStart(2, '0')}</div>
          <div className="w-20 h-1 bg-black mt-2" />
        </div>
        {/* Music Albums */}
        <div>
          <h2 className="text-xl font-bold text-gray-800 mb-4">Album</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {musicLibrary.map((album) => (
              <div key={album.id} className="group">
                <div
                  onClick={() => {
                    router.push(`/album/${album.id}`);
                  }}
                >
                  <Image
                    src={album.coverImage}
                    alt={album.title}
                    width={200}
                    height={200}
                    className="transition-transform duration-300 cursor-pointer"
                  />
                </div>
                <h3 className="font-semibold text-sm mt-2 text-gray-800">
                  {album.title}
                </h3>
                <p className="text-xs text-gray-600">{album.artist}</p>
                <p className="text-xs text-gray-500">
                  {album.year} • {album.songs.length} Songs
                </p>
              </div>
            ))}
          </div>
        </div>
        {/* Download Music beta*/}
      </div>

      {/* 下载按钮 */}
      {showDownload && (
        <div className="absolute bottom-0 right-0 p-4 px-12">
          <button
            onClick={() => setShowDownloadModal(true)}
            className="bg-black cursor-pointer text-white py-2 px-4 flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download
          </button>
        </div>
      )}

      {/* 下载模态框 */}
      <DownloadMusicModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
      />
    </div>
  );
}
