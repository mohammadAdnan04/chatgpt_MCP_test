import React from 'react';

const Tabs = ({ activeTab, onTabChange }) => {
  return (
    <div className="flex items-center gap-2 mb-4">
      <button
        onClick={() => onTabChange('people')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          activeTab === 'people'
            ? 'bg-[#04145C] text-white'
            : 'bg-white text-[#434343] hover:bg-gray-50 border border-[#E5E6E6]'
        }`}
      >
        People
      </button>
      <button
        onClick={() => onTabChange('companies')}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          activeTab === 'companies'
            ? 'bg-[#04145C] text-white'
            : 'bg-white text-[#434343] hover:bg-gray-50 border border-[#E5E6E6]'
        }`}
      >
        Companies
      </button>
    </div>
  );
};

export default Tabs;
