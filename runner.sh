#!/bin/bash
set -ex

cd js/ 
npm run build 
cd ..

cd program
cargo build-bpf
solana deploy target/deploy/echo.so

