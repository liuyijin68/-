/**
 * 微信小程序全局类型声明
 */
declare const wx: {
  requirePrivacyAuthorize(options?: {
    success?: () => void
    fail?: (err: any) => void
    complete?: () => void
  }): Promise<any>
  authorize(options: { scope: string }): Promise<any>
  showModal(options: {
    title: string
    content: string
    confirmText?: string
    cancelText?: string
  }): Promise<any>
  openSetting(): Promise<any>
}