module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo auto-injects worklets/reanimated when those packages are installed.
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'babel-plugin-module-resolver',
        {
          root: ['./'],
          alias: {
            '@': './src',
          },
        },
      ],
    ],
  };
};
