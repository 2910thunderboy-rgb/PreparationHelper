import React from "react";
import Navbar from "../components/Navbar";
import Hero from "./Hero";
import Footer from "./Footer";

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#05040a] text-zinc-100">
      <Navbar />
      <Hero />
      <Footer />
    </div>
  );
}

export default LandingPage;
