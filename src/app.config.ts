export default (typeof definePageConfig === 'function'
  ? defineAppConfig({
      pages: [
        'pages/index/index',
        'pages/upload/index',
        'pages/dictation/index',
        'pages/vocabulary/index'
      ],
      window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '单词听写助手',
        navigationBarTextStyle: 'black'
      },
      // @ts-ignore 微信小程序隐私保护配置
      __usePrivacy__: true,
      permission: {
        'scope.camera': {
          desc: '用于拍摄单词照片进行识别'
        },
        'scope.record': {
          desc: '用于录制您的语音进行中文含义识别'
        },
        'scope.writePhotosAlbum': {
          desc: '用于保存识别结果图片'
        }
      }
    })
  : {
      pages: ['pages/index/index', 'pages/upload/index', 'pages/dictation/index', 'pages/vocabulary/index'],
      window: {
        backgroundTextStyle: 'light',
        navigationBarBackgroundColor: '#fff',
        navigationBarTitleText: '单词听写助手',
        navigationBarTextStyle: 'black'
      }
    })