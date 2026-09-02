"use client";

import { useEffect } from "react";
import Image from "next/image";

export default function ChatwootWidget() {
  const whatsappNumber = "971585089653"; // Your WhatsApp number
  const message = encodeURIComponent("Hello! I need some help with Mawsool.");
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${message}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 hover:shadow-xl"
      aria-label="Chat on WhatsApp"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-8 w-8"
      >
        <path d="M12.031 21c-1.618 0-3.18-.425-4.56-1.23l-5.114 1.34 1.366-4.982c-.886-1.424-1.354-3.076-1.354-4.78C2.37 5.626 6.7 1.3 12.031 1.3s9.66 4.326 9.66 9.648-4.328 9.65-9.66 9.65zm0-18C7.57 3 3.95 6.613 3.95 11.048c0 1.55.405 3.064 1.176 4.398l-.873 3.185 3.26-.856c1.284.7 2.73 1.07 4.218 1.07 4.46 0 8.08-3.614 8.08-8.048S16.492 3 12.03 3zm4.436 10.978c-.244-.122-1.438-.708-1.66-.79-.223-.08-.385-.122-.547.122-.162.244-.63.79-.77.95-.143.163-.286.184-.53.062-.243-.122-1.026-.378-1.954-1.206-.72-.644-1.206-1.44-1.348-1.684-.143-.244-.015-.376.107-.498.11-.11.243-.284.364-.426.122-.142.163-.244.244-.406.08-.163.04-.306-.02-.428-.06-.122-.547-1.32-.75-1.808-.196-.475-.395-.41-.547-.418-.142-.008-.305-.008-.468-.008-.162 0-.426.06-.65.305-.222.244-.85.832-.85 2.03s.87 2.353.99 2.516c.123.163 1.716 2.617 4.157 3.67.58.25 1.032.4 1.385.51.583.186 1.114.16 1.534.097.47-.07 1.438-.588 1.64-1.156.203-.568.203-1.054.143-1.156-.06-.102-.223-.162-.467-.284z" />
      </svg>
    </a>
  );
}
