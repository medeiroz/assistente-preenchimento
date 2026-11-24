export function compareVersions(a: string, b: string): number;
export function decidirChrome(
  status: {
    publishedItemRevisionStatus?: { distributionChannels?: { crxVersion?: string }[] };
    submittedItemRevisionStatus?: { distributionChannels?: { crxVersion?: string }[] };
  },
  versao: string,
): { acao: 'enviar' | 'adiar' | 'ja-publicada'; motivo: string };
export function decidirFirefox(
  lista: { results?: { version: string }[] },
  versao: string,
): { acao: 'enviar' | 'ja-publicada'; motivo: string };
