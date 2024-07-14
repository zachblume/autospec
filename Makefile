.DEFAULT_GOAL := todomvc

clean:
	rm -rf trajectories
	
realworld:
	npm run build && npx autospecai --url "https://demo.realworld.io/" --model gemini-1.5-flash-latest

todomvc:
	npm run build && npx autospecai --url "https://todomvc.com/examples/react/dist/" --model gemini-1.5-flash-latest

bench:
	npm run build && npm run benchmark	
