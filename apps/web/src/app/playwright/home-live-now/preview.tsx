"use client";
import dynamic from "next/dynamic";
export const Preview = dynamic(() => import("./client"), { ssr: false });
