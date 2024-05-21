.DEFAULT_GOAL := reset

reset: stop start

start: todomvc realitycheck

stop: stoptodomvc killrealitycheck

todomvc:
	docker run -d --name todomvc -p 9999:8080 daptin/todomvc-vuejs

stoptodomvc:
	docker rm -f todomvc || true

realitycheck:
	node realitycheck

killrealitycheck:
	pkill -f realitycheck.js