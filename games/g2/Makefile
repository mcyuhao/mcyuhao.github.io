.PHONY: build

build:
	node build.js

update: install
	cd js13k-compiler && git checkout master && git pull && npm install

install:
	git submodule init
	git submodule update
