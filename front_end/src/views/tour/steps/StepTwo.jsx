import FilterPanel from "@/components/search/FilterPanel";
import React, { useEffect, useState } from "react";
import TempFilterPanel from "../TempFilterPanel";

const StepTwo = () => {
  const [tableData, setTableData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [searched, setSearched] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [searchFilter, setSearchFilter] = useState({});
  const [aiSearchQuery, setAiSearchQuery] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [filterKey, setFilterKey] = useState(0);
  const [style, setStyle] = useState({});
  
  useEffect(() => {
    const target = document.querySelector(".allfilterwap-main");
    if (target) {
      const rect = target.getBoundingClientRect();
      setStyle({
        position: "absolute",
        left: rect.left + "px",
        top: rect.top + "px",
      });
    }
  }, []);
  return (
    <>
      <TempFilterPanel
        className={
          "w-[288px]  rounded-xl !h-[74vh] bg-white border-4 border-[#C7F5FF]"
        }
        style={style}
      />
    </>
  );
};

export default StepTwo;
