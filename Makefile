.DEFAULT_GOAL := reset

reset: install stop start

start: todomvc realitycheck

stop: stoptodomvc killrealitycheck

install:
	npm install
	npx husky install
	npx playwright install  

todomvc:
	docker run -d --name todomvc -p 9999:8080 daptin/todomvc-vuejs

stoptodomvc:
	docker rm -f todomvc || true

realitycheck:
	node index

killrealitycheck:
	pkill -f index.js || true