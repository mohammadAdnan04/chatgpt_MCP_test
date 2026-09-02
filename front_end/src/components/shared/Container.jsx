import React from "react";

const Container = ({ children, className, outerDivClassName }) => {
  return (
    <div className={`px-3 flex flex-col items-center w-full ${outerDivClassName}`}>
      <div className={`max-w-[1280px] w-full ${className}`}>{children}</div>
    </div>
  );
};

export default Container;
