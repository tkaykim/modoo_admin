'use client'

import React from 'react';
import { useCanvasStore } from '@/store/useCanvasStore';

const EditButton = ({className} : {className? : string}) => {
  const { isEditMode, setEditMode } = useCanvasStore();

  // Don't show button when already in edit mode
  if (isEditMode) return null;

  const handleEditClick = () => {
    setEditMode(true);
  };

  return (
    <button
      onClick={handleEditClick}
      className={`px-8 py-3 bg-blue-600 w-full text-white rounded-lg font-semibold hover:bg-blue-700 transition shadow-xl text-sm ${className}`}
    >
      디자인하기
    </button>
  );
};

export default EditButton;
