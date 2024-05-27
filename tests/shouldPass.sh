#!/bin/bash

# grab OPENAI_API_KEY from environment
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Please set the OPENAI_API_KEY environment variable."
  exit 1
fi

testUrls=(
  'https://todomvc.com/examples/react/dist/'
  'https://demo.realworld.io/#/'
)

for url in "${testUrls[@]}"; do
  echo "Running autospec for $url..."
  URL=$url node index
  if [ $? -ne 0 ]; then
    echo "autospec failed for $url"
    exit 1
  else
    echo "autospec passed for $url"
  fi
done

echo "All tests passed successfully."