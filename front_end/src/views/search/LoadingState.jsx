const LoadingState = ({ progress = 0, className, searchMode = "people" }) => {
  return (
    <div className={`LoadingState w-full h-full p-4 flex items-center justify-center rounded-2xl border border-[#E5E6E6] bg-[#FBFBFC] ${className}`}>
      <div className="max-w-[385px] w-full flex flex-col items-center text-center gap-4">
        <img
          src="/icons/notFoundSearch.gif"
          className="select-none"
          draggable={false}
           style={{ width: "130px"}}
          alt=""
        />
       
        <p className="text-2xl font-semibold text-[#434343]">
          Searching
        </p>
        <div className="w-full h-2 bg-[#DEDEDE] overflow-hidden rounded-full">
          <div
            className="bg-gradient-to-r from-[#04145C] to-[#00D2FF] h-full transition-all duration-300 ease-out rounded-full"
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
        <p className="text-sm text-[#434343]">
          {progress < 30
            ? "Initializing search..."
            : progress < 70
            ? `Searching databases... ${Math.round(progress)}%`
            : progress < 100
            ? `Processing results... ${Math.round(progress)}%`
            : "Search completed!"}
        </p>
      </div>
    </div>
  );
};

export default LoadingState;
