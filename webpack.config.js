// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VueLoaderPlugin } = require("vue-loader");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { EnvironmentPlugin, DefinePlugin } = require("webpack");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CopyWebpackPlugin = require("copy-webpack-plugin");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = (env, argv) => ({
  entry: {
    bundle: "./src/megamoji",
    // gifworkerは `new Worker("./gifworker.js")` という固定文字列で読み込まれるため、
    // ファイル名にcontenthashを付けず固定名のままにする(bundleとは別扱い)
    gifworker: "./src/gifworker",
  },
  devServer: {
    static: {
      directory: "dist",
    },
  },
  output: {
    path: `${__dirname}/dist`,
    filename: (pathData) => (
      pathData.chunk.name === "gifworker" ? "gifworker.js" : "[name].[contenthash].js"
    ),
    assetModuleFilename: "assets/[hash][ext][query]",
  },
  devtool: "source-map",
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "ts-loader",
        options: {
          appendTsSuffixTo: [/\.vue$/],
        },
      }, {
        test: /\.css$/,
        use: ["vue-style-loader", "css-loader"],
      }, {
        test: /\.vue$/,
        use: "vue-loader",
      }, {
        test: /\.(woff|svg|png)$/,
        type: "asset/resource",
      }, {
        test: /\.glsl$/,
        loader: "webpack-glsl-minify",
        options: {
          preserveUniforms: true,
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  plugins: [
    new DefinePlugin({
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
    }),
    new EnvironmentPlugin({
      NODE_ENV: argv.mode,
      ROLLBAR_TOKEN: "",
      GA4_TOKEN: "",
      CODE_VERSION: "",
    }),
    new VueLoaderPlugin(),
    // index.htmlは静的コピーではなく、ビルドのたびに<script>タグを
    // (ハッシュ付きの)正しいファイル名で自動生成する
    new HtmlWebpackPlugin({
      template: `${__dirname}/static/index.html`,
      filename: "index.html",
      chunks: ["bundle"], // gifworkerは<script>タグとして埋め込まない(Workerとして動的読み込みのため)
      inject: "body",
    }),
    new CopyWebpackPlugin({
      patterns: [{
        context: `${__dirname}/static`,
        from: "*",
        to: `${__dirname}/dist`,
        globOptions: {
          // index.htmlはHtmlWebpackPluginが生成するので、単純コピー対象からは除外する
          ignore: ["**/index.html"],
        },
      }],
    }),
  ],
});
