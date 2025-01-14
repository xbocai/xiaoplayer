import { SHARE_COVER, SLOGAN, store } from '@/miniprogram/stores';
import { Device, ServerConfig } from '@/miniprogram/types';
import { isPrivateDomain, request } from '@/miniprogram/utils';
import { reaction } from 'mobx-miniprogram';
import { ComponentWithStore } from 'mobx-miniprogram-bindings';

ComponentWithStore({
  data: {
    status: {} as Record<string, boolean>,
    devices: [] as Device[],
    serverConfig: {} as ServerConfig,
    ADUnitId: import.meta.env.VITE_AD_SETTING_UNITID,
  },
  storeBindings: [
    {
      store,
      fields: ['did', 'version'] as const,
      actions: [] as const,
    },
    {
      store: store.hostPlayer,
      fields: ['mode'] as const,
      actions: [] as const,
    },
  ],
  lifetimes: {
    attached() {
      store.setData({ showAppBar: false });
      this.setData({
        devices: Object.values(store.devices).concat({
          name: '本机',
          did: 'host',
          hardware: '本机',
          cur_music: store.did === 'host' ? store.musicName : undefined,
          cur_playlist: store.did === 'host' ? store.musicAlbum : undefined,
        }),
        serverConfig: { ...store.serverConfig },
      });
      this.syncDeviceStatus();
      this._disposer = reaction(
        () => store.status,
        (status) => {
          this.setData({
            status: {
              ...this.data.status,
              [store.did!]: status === 'playing',
            },
          });
        },
      );
    },
    detached() {
      store.setData({ showAppBar: true });
      this._disposer();
    },
  },
  methods: {
    _disposer() {},
    onShareAppMessage() {
      return {
        path: `/pages/index/index?serverConfig=${JSON.stringify(this.data.serverConfig)}`,
        title: SLOGAN,
        imageUrl: SHARE_COVER,
      };
    },
    syncDeviceStatus() {
      this.data.devices.forEach(async (device) => {
        if (device.did === 'host') {
          this.setData({
            status: {
              ...this.data.status,
              [device.did]: store.status === 'playing',
            },
          });
          return;
        }
        const res = await request<{
          cur_music: string;
          is_playing: boolean;
        }>({
          url: `/playingmusic?did=${device.did}`,
        });
        this.setData({
          status: {
            ...this.data.status,
            [device.did]: res.data.is_playing,
          },
        });
      });
    },
    handleFormChange(e: {
      currentTarget: {
        dataset: {
          name: string;
        };
      };
      detail: {
        value: string;
      };
    }) {
      const { name } = e.currentTarget.dataset;
      if (!name) return;
      this.setData({
        serverConfig: {
          ...this.data.serverConfig,
          [name]: e.detail.value,
        },
      });
    },
    handleHostModeChange(e: {
      detail: {
        value: string;
      };
    }) {
      store.hostPlayer.setMode(e.detail.value ? 'background' : 'inner');
    },
    async handleSaveConfig() {
      wx.showToast({
        title: '保存成功',
        icon: 'none',
      });
      const { serverConfig } = this.data;
      const { privateDomain, publicDomain } = serverConfig;
      const config = {
        ...serverConfig,
        publicDomain: publicDomain?.trim().replace(/\/$/, ''),
        privateDomain: privateDomain?.trim().replace(/\/$/, ''),
        domain:
          serverConfig.domain && isPrivateDomain(serverConfig.domain)
            ? privateDomain || publicDomain!
            : publicDomain || privateDomain!,
      };
      store.setServerConfig(config);
      await store.initSettings();
      wx.reLaunch({ url: '/pages/index/index' });
    },
    handleSwitchDevice(e: {
      currentTarget: {
        dataset: {
          did: string;
        };
      };
    }) {
      const { did } = e.currentTarget.dataset;
      if (did) store.setData({ did });
    },
    async handleStopMusic() {
      const queue = Object.entries(this.data.status).map(([did, playing]) => {
        if (!playing) return Promise.resolve();
        if (did === 'host') {
          store.player.pauseMusic();
          return true;
        }
        return store.sendCommand('关机', did);
      });
      const res = await Promise.all(queue);
      if (res.every((r) => !r)) {
        wx.showToast({
          title: '暂无设备播放中',
          icon: 'none',
        });
      } else {
        wx.showToast({
          title: '设备已全部关闭',
          icon: 'none',
        });
      }
      this.syncDeviceStatus();
    },
    navigateToMore() {
      wx.navigateTo({
        url: '/pages/setting/more',
      });
    },
  },
});
