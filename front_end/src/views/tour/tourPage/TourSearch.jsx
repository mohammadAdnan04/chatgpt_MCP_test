"use client";

import React, { useState } from "react";

import FilterPanel from "@/components/search/FilterPanel";
import Table from "@/components/shared/Table";
import EmptyState from "@/views/search/EmptyState";
import LoadingState from "@/views/search/LoadingState";
import TempDashboardContainer from "@/views/tour/TempDashboardContainer";
import AIPrompt from "@/components/modals/AIPrompt";

const TourSearch = ({ step }) => {
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [searched, setSearched] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [searchFilter, setSearchFilter] = useState({});
  const [aiSearchQuery, setAiSearchQuery] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [filterKey, setFilterKey] = useState(0);

  return (
    <TempDashboardContainer heading={"Search"} activeRoute={"search"}>
      {(step == 5) && <AIPrompt forceStep={1} isTour={true} tourStep={step} />}
      {(step == 6 || step == 7) && <AIPrompt forceStep={2} isTour={true} tourStep={step} />}
      <div className="w-full h-full flex gap-1">
        <FilterPanel
          step={step}
          className={"!overflow-y-hidden"}
          key={filterKey}
          setTableData={setTableData}
          setLoading={setLoading}
          setLoadingProgress={setLoadingProgress}
          searched={searched}
          setSearched={setSearched}
          setCursor={setCursor}
          searchFilter={searchFilter}
          setSearchFilter={setSearchFilter}
          setAiSearchQuery={setAiSearchQuery}
          itemsPerPage={itemsPerPage}
        />

        {!searched && <EmptyState />}
        {loading && <LoadingState progress={loadingProgress} />}
        {!loading && searched && (
          <Table
            data={tableData}
            cursor={cursor}
            searchFilter={searchFilter}
            setLoading={setLoading}
            setLoadingProgress={setLoadingProgress}
            setSearched={setSearched}
            setTableData={setTableData}
            setCursor={setCursor}
            setItemsPerPage={setItemsPerPage}
          />
        )}

        {aiSearchQuery && (
          <AIPrompt
            setAiSearchQuery={setAiSearchQuery}
            result={tableData}
            searchFilter={searchFilter}
          />
        )}
      </div>
    </TempDashboardContainer>
  );
};

export default TourSearch;
