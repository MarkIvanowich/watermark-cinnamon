/*
* Watermark - Cinnamon desktop extension
* Place a watermark on the desktop
* Copyright (C) 2018  Germán Franco Dorca
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

const Clutter = imports.gi.Clutter;
const Cogl = imports.gi.Cogl;
const GdkPixbuf = imports.gi.GdkPixbuf;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Main = imports.ui.main;
const Settings = imports.ui.settings;
const St = imports.gi.St;

const ERROR_ICON_NAME = 'face-sad-symbolic';
const DEFAULT_ICON_SIZE = 128;

function MyExtension(meta) {
	this._init(meta);
}

MyExtension.prototype = {

	_init: function (meta) {
		this.meta = meta;
		this.watermarks = [];
	},

	enable: function() {
		this.settings = new Settings.ExtensionSettings(this, this.meta.uuid);
		this.settings.bind('icon-name', 'icon_name', this.on_settings_updated);
		this.settings.bind('scale', 'scale', this.on_settings_updated);
		this.settings.bind('position-x', 'position_x', this.on_settings_updated);
		this.settings.bind('position-y', 'position_y', this.on_settings_updated);
		this.settings.bind('icon-alpha', 'icon_alpha', this.on_settings_updated);

		// FIXME: Not firing!
		this.monitorsChangedId = global.screen.connect('monitors-changed', () => {
			this._clear_watermarks();
			this._init_watermarks();
		});

		this._init_watermarks();
	},

	_init_watermarks: function() {
		for(let i = global.screen.get_n_monitors()-1; i >= 0; i--) {
			let monitor = Main.layoutManager.monitors[i];
			this.watermarks.push(new Watermark(monitor, this));
		}
	},

	_clear_watermarks: function() {
		for(let wm of this.watermarks) {
			wm.destroy();
		}
		this.watermarks = [];
	},

	disable: function() {
		this._clear_watermarks();
	},

	on_settings_updated: function() {
		for(let wm of this.watermarks)
			wm.update();
	}
};

function Watermark(monitor, manager) {
	this._init(monitor, manager);
}

Watermark.prototype = {
	_init: function(monitor, manager) {
		this.manager = manager;
		this.monitor = monitor;

		this.actor = new St.Bin();
		this.actor.style = 'color: white;';
		this.icon = null;

		global.bottom_window_group.insert_child_at_index(this.actor, 0);

		/* Position can't be calculated until size is set, and that is async */
		this.actor.connect('queue-redraw', () => this.update_position());
		this.update();
	},

	update: function() {
		if(this.icon) {
			this.icon.destroy();
		}
		this.icon = this.get_icon(this.manager.icon_name, this.manager.scale);
		this.actor.set_child(this.icon);

		this.actor.set_opacity(this.manager.icon_alpha * 255 / 100);
	},

	update_position: function() {
		let x = this.monitor.x + (this.monitor.width - this.actor.width) * this.manager.position_x / 100;
		let y = this.monitor.y + (this.monitor.height - this.actor.height) * this.manager.position_y / 100;
		this.actor.set_position(Math.floor(x), Math.floor(y));
	},

	get_icon: function(icon, scale) {
		if(Gtk.IconTheme.get_default().has_icon(icon)) { // Icon name
			let icon_size = Math.floor(DEFAULT_ICON_SIZE * scale / 100);
			return new St.Icon({ icon_name: icon, icon_size, icon_type: St.IconType.SYMBOLIC });
		} else { // Image path
			if(GLib.file_test(icon, GLib.FileTest.EXISTS))
				return this.get_image(icon, scale);

			let xlet_icon = this.manager.meta.path + '/icons/' + icon.toLowerCase().replace(' ', '-') + '-symbolic.svg';
			if(GLib.file_test(xlet_icon, GLib.FileTest.EXISTS))
				return this.get_image(xlet_icon, scale);
		}

		global.logError(this.manager.meta + ": watermark file not found (" + icon + ")");
		return new St.Icon({ icon_name: ERROR_ICON_NAME, icon_size: DEFAULT_ICON_SIZE, icon_type: St.IconType.SYMBOLIC });
	},

	get_image: function(path, scale) {
		let pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
		let height = Math.floor(pixbuf.get_height() * scale / 100);
		let width = Math.round(height * pixbuf.get_width() / pixbuf.get_height());
		let image = new Clutter.Image();
		image.set_data(pixbuf.get_pixels(),
		               pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
		               pixbuf.get_width(),
		               pixbuf.get_height(),
		               pixbuf.get_rowstride());
		return new Clutter.Actor({ content: image, width, height });
	},

	destroy: function() {
		this.actor.destroy();
		this.actor = null;
		this.manager = null;
	}
};

let extension = null;
function enable() {
	extension.enable();
}

function disable() {
	extension.disable();
	extension = null;
}

function init(metadata) {
	if(!extension) {
		extension = new MyExtension(metadata);
	}
}
