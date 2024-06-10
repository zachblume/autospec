export default {
    transform: {
        "^.+\\.jsx?$": "babel-jest",
        "^.+\\.mjs$": "babel-jest",
    },
    moduleFileExtensions: ["js", "jsx", "mjs"],
    testEnvironment: "node",
    transformIgnorePatterns: ["/node_modules/(?!(@?\\w+-?\\w*?|-?\\w+))/"],
};
