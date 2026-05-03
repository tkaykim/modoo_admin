'use client';

import { useState, useCallback } from 'react';
import { Search, X, MapPin, Loader2 } from 'lucide-react';

interface JusoResult {
  roadAddr: string;      // 도로명 주소
  jibunAddr: string;     // 지번 주소
  zipNo: string;         // 우편번호
  siNm: string;          // 시도명
  sggNm: string;         // 시군구명
  emdNm: string;         // 읍면동명
  bdNm: string;          // 건물명
}

interface AddressSearchProps {
  onSelect: (address: {
    postalCode: string;
    state: string;
    city: string;
    addressLine1: string;
  }) => void;
  onClose: () => void;
}

export default function AddressSearch({ onSelect, onClose }: AddressSearchProps) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<JusoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const searchAddress = useCallback(async () => {
    if (!keyword.trim()) {
      setError('검색어를 입력해주세요.');
      return;
    }

    if (keyword.trim().length < 2) {
      setError('검색어는 2글자 이상 입력해주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const response = await fetch('/api/address/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keyword: keyword.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '주소 검색에 실패했습니다.');
      }

      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '주소 검색에 실패했습니다.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchAddress();
    }
  };

  const handleSelect = (result: JusoResult) => {
    onSelect({
      postalCode: result.zipNo,
      state: result.siNm,
      city: result.sggNm,
      addressLine1: result.roadAddr,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">주소 검색</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="도로명, 건물명, 지번 검색"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            <button
              onClick={searchAddress}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                '검색'
              )}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            예: 테헤란로 152, 강남대로 123, 삼성동 123-45
          </p>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 text-red-600 text-sm bg-red-50">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          )}

          {!loading && searched && results.length === 0 && !error && (
            <div className="text-center py-12 text-gray-500">
              <MapPin className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>검색 결과가 없습니다.</p>
              <p className="text-sm mt-1">다른 검색어로 다시 시도해주세요.</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="divide-y">
              {results.map((result, index) => (
                <button
                  key={index}
                  onClick={() => handleSelect(result)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{result.roadAddr}</p>
                      <p className="text-sm text-gray-500 mt-1">[{result.zipNo}] {result.jibunAddr}</p>
                      {result.bdNm && (
                        <p className="text-sm text-blue-600 mt-1">{result.bdNm}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {!searched && !loading && (
            <div className="text-center py-12 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>주소를 검색해주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
