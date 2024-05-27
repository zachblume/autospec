.DEFAULT_GOAL := reset

reset: install stop start

start: todomvc autospec

stop: stoptodomvc killautospec

install:
	npm install
	npx husky install
	npx playwright install  

todomvc:
	docker run -d --name todomvc -p 9999:8080 daptin/todomvc-vuejs
	# wait until the webpage at http://localhost:9999 is up and responds with
	# <h1>todos</h1> present in the response body
	until curl -s http://localhost:9999 | grep "<h1>todos</h1>"; do sleep 1; done
	echo "todomvc app is up"

stoptodomvc:
	docker rm -f todomvc || true

autospec:
	node index

killautospec:
	pkill -f index.js || true

clean:
	rm -rf trajectories
	
realworld:
	URL="https://demo.realworld.io/" node index