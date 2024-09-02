.DEFAULT_GOAL := todomvc

clean:
	rm -rf trajectories
	
realworld:
	npm run build && npx autospecai --url "https://demo.realworld.io/" --model gemini-1.5-flash-latest

todomvc:
	npm run build && npx autospecai --url "https://todomvc.com/examples/react/dist/" --model gemini-1.5-flash-latest

bench:
	npm run build && npm run benchmark	

release:
	npm run lint
	npm run format
	npm run test
	npm run build
	# prompt for otp via bash
	@read -p "Enter OTP: " OTP; \
	npm publish --otp=$$OTP