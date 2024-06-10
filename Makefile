.DEFAULT_GOAL := todomvc

clean:
	rm -rf trajectories
	
realworld:
	npx autospecai --url "https://demo.realworld.io/" --model gemini-1.5-flash-latest

todomvc:
	npx autospecai --url "https://todomvc.com/examples/react/dist/" --model gemini-1.5-flash-latest