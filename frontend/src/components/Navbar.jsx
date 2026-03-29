import React, { useState } from "react";
import { FiMenu, FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 left-0 z-50 flex w-full items-center justify-between bg-[#07060b]/80 px-6 py-4 text-white backdrop-blur-xl md:px-10">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="text-lg font-semibold tracking-tight transition hover:text-violet-200"
      >
        Career<span className="text-violet-400">.ai</span>
      </button>

      <div className="hidden items-center gap-8 md:flex">
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-sm text-zinc-400 transition hover:text-white"
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => navigate("/register")}
          className="rounded-full bg-violet-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-500"
        >
          Sign up
        </button>
      </div>

      <button
        type="button"
        className="text-2xl text-white md:hidden"
        aria-expanded={isOpen}
        aria-label="Menu"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <FiX /> : <FiMenu />}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full flex w-full flex-col items-center gap-6 border-t border-white/10 bg-[#0a0910]/95 px-6 py-8 md:hidden">
          <button
            type="button"
            onClick={() => {
              navigate("/login");
              setIsOpen(false);
            }}
            className="text-zinc-300"
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              navigate("/register");
              setIsOpen(false);
            }}
            className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-medium text-white"
          >
            Sign up
          </button>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
