/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env";
import type { NextConfig } from "next";

const config = {
	serverExternalPackages: ["pino", "pino-pretty"],
} satisfies NextConfig;

export default config;
