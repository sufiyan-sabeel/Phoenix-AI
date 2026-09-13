#!/bin/bash
# PHOENIX Termux Environment Setup
pkg update -y
pkg install -y git nodejs python nmap dnsutils curl net-tools iproute2 traceroute termux-api
echo "PHOENIX dependencies installed."
echo "Run 'phoenix' to start."
