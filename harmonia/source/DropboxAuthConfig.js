/**
 * @see https://www.dropbox.com/developers/reference/api
 * @see https://www.dropbox.com/developers/blog/20
 */
enyo.kind({
	name: "DropboxAuthConfig",
	kind: "FittableRows",

	// private members
	debug: false,
	requestTokenUrl: "https://api.dropbox.com/1/oauth/request_token",
	authorizeUrl: "https://www.dropbox.com/1/oauth/authorize",
	accessTokenUrl: "https://api.dropbox.com/1/oauth/access_token",
	accountInfoUrl: "https://api.dropbox.com/1/account/info",

	requestToken: "",		// from dropbox
	requestTokenSecret: "",		// from dropbox
	uid: "",			// from dropbox

	// public members
	published: {
		serviceId: "",		// from ide.json
		serviceName: "",	// from ide.json
		auth: {}
	},

	// emitted events
	events: {
		onUpdateAuth: "",
		onError: ""
	},

	// static UI elements
	components: [
		{kind: "Ares.Groupbox", components: [
			{kind: "onyx.GroupboxHeader", name: "serviceName"},
			{components: [
				{content: "User Name: ", kind: "Ares.GroupBoxItemKey"},
				{name: "username", kind: "Ares.GroupBoxItemValue"}
			]},
			{components: [
				{content: "Email: ", kind: "Ares.GroupBoxItemKey"},
				{name: "email", kind: "Ares.GroupBoxItemValue"}
			]},
			{components: [
				{content: "Country Code:", kind: "Ares.GroupBoxItemKey"},
				{name: "country", kind: "Ares.GroupBoxItemValue"}
			]},
			{components: [
				{content: "Quota (Max):", kind: "Ares.GroupBoxItemKey"},
				{name: "quota", kind: "Ares.GroupBoxItemValue"}
			]},
			{components: [
				{content: "Usage (Private):", kind: "Ares.GroupBoxItemKey"},
				{name: "normal", kind: "Ares.GroupBoxItemValue"}
			]},
			{components: [
				{content: "Usage (Shared):", kind: "Ares.GroupBoxItemKey"},
				{name: "shared", kind: "Ares.GroupBoxItemValue"}
			]}
		]},
		{kind: "FittableColumns", components: [
			{name: "renewBtn", kind: "onyx.Button", content: "Renew", disabled: false, ontap: "renew"},
			{name: "checkBtn", kind: "onyx.Button", content: "Check", disabled: true, ontap: "check"}
		]}
	],

	create: function() {
		this.inherited(arguments);
		if (this.debug) this.log("title:", this.title);
		this.$.serviceName.setContent(this.serviceName);
		this.auth = this.auth || {};
		this.auth.headers = this.auth.headers || {};
		if (this.auth.headers.authorization) {
			this.$.checkBtn.setDisabled(false);
		}
		this.waitAccountInfo();
	},
	check: function() {
		var self = this;
		this.$.checkBtn.setDisabled(true);
		async.series([
			this.waitAccountInfo.bind(this),
			this.getAccountInfo.bind(this),
			this.displayAccountInfo.bind(this)
		], function(err, results) {
			enyo.log("DropboxAuthConfig.check: err:", err, "results:", results);
			self.$.checkBtn.setDisabled(false);
			if (err) {
				self.doError({
					msg: "Unable to check Dropbox Account",
					details: err.toString()
				});
			}
		});
	},
	renew: function() {
		var self = this;
		// Disable [Renew] button during async processing...
		this.$.renewBtn.setDisabled(true);
		async.series([
			this.waitAccountInfo.bind(this),
			this.getRequestToken.bind(this),
			this.authorize.bind(this),
			this.getAccessToken.bind(this),
			this.saveAccessToken.bind(this),
			this.getAccountInfo.bind(this),
			this.displayAccountInfo.bind(this)
		], function(err, results) {
			enyo.log("DropboxAuthConfig.renew: err:", err, "results:", results);
			// ... and re-enable it after success of failure.
			self.$.renewBtn.setDisabled(false);
			if (err) {
				self.doError({
					msg: "Unable to renew Dropbox Account tokens",
					details: err.toString()
				});
			}
		});
	},
	//* @private
	getOauthTimestamp: function() {
		return Date.now() /1000 |0;
	},
	//* @private
	getOauthNonce: function() {
		// 24-characters random string (same method as
		// multipart/form-data separator)
		var nonce = "";
		for (var i = 0; i < 24; i++) {
			nonce += Math.floor(Math.random() * 10).toString(16);
		}
		return nonce;
	},
	makeOAuthRequestTokenObject: function(appKey, appSecret) {
		var obj = {
			// http://oauth.net/core/1.0/#rfc.section.6.1.1
			oauth_signature_method: "PLAINTEXT",
			oauth_consumer_key: appKey,
			oauth_signature: appSecret + '&'
		};
		return obj;
	},
	makeOAuthHeaderObject: function(appKey, appSecret, token, tokenSecret) {
		var obj = {
			// http://oauth.net/core/1.0/#rfc.section.6.1.1
			oauth_signature_method: "PLAINTEXT",
			oauth_consumer_key: appKey,
			oauth_token: token,
			oauth_signature: appSecret + '&' + tokenSecret
		};
		return obj;
	},
	//* @private
	makeOAuthHeader: function(prefix, params) {
		var header = prefix + ' ', sep = ', ';
		header += 'oauth_version="1.0"';
		enyo.forEach(enyo.keys(params), function(key) {
			header += sep + key + '="' + params[key] + '"';
		}, this);
		this.log("header:", header);
		return header;
	},
	//* @private
	getRequestToken: function(next) {
		if (!this.auth.appKey || !this.auth.appSecret) {
			this.error("Ares IDE mis-configuration: missing Dropbox AppKey and/or AppSecret in ide.json");
			next(new Error("Ares IDE mis-configuration: Contact your Ares administrator"));
			return;
		}
		var reqOptions = {
			url: this.requestTokenUrl,
			method: 'POST',
			handleAs: 'text',
			headers: {
				'cache-control': false,
				Authorization: this.makeOAuthHeader('OAuth', this.makeOAuthRequestTokenObject(this.auth.appKey, this.auth.appSecret))
			}
		};
		this.log("options:", reqOptions);
		var req = new enyo.Ajax(reqOptions);
		req.response(this, function(inSender, inValue) {
			this.log("response:", inValue);
			var form = ares.decodeWebForm(inValue);
			this.log("form:", form);
			this.requestTokenSecret = form.oauth_token_secret;
			this.requestToken = form.oauth_token;
			this.uid = form.uid;
			next();
		});
		req.error(this, function(inSender, inError) {
			this.log("response:", inError);
			next(new Error(inError));
		});
		req.go();
	},
	authorize: function(next) {
		var popup = window.open(this.authorizeUrl + '?oauth_token=' + encodeURIComponent(this.requestToken),
					"Dropbox Authentication",
					"resizeable=1,width=1024, height=600");
		// Check that the popup is closed every seconds.
		var timer = setInterval(function() {
			if(popup.closed) {
				clearInterval(timer);
				enyo.log("Dropbox popup closed");
				next();
			}
		}, 1000);
	},
	getAccessToken: function(next) {
		var reqOptions = {
			url: this.accessTokenUrl,
			method: 'POST',
			handleAs: 'text',
			headers: {
				'cache-control': false,
				Authorization: this.makeOAuthHeader('OAuth', this.makeOAuthHeaderObject(this.auth.appKey, this.auth.appSecret, this.requestToken, this.requestTokenSecret))
			}
		};
		this.log("options:", reqOptions);
		var req = new enyo.Ajax(reqOptions);
		req.response(this, function(inSender, inValue) {
			this.log("response:", inValue);
			var form = ares.decodeWebForm(inValue);
			this.log("form:", form);
			this.auth.accessTokenSecret = form.oauth_token_secret;
			this.auth.accessToken = form.oauth_token;
			this.auth.uid = form.uid;
			this.auth.headers.authorization = this.makeOAuthHeader('OAuth', this.makeOAuthHeaderObject(this.auth.appKey, this.auth.appSecret, this.auth.accessToken, this.auth.accessTokenSecret));
			next();
		});
		req.error(this, function(inSender, inError) {
			this.log("response:", inError);
			next(new Error(inError));
		});
		req.go();
	},
	saveAccessToken: function(next) {
		var event = {
			serviceId: this.serviceId,
			auth: {
				accessToken: this.auth.accessToken,
				accessTokenSecret: this.auth.accessTokenSecret,
				uid: this.auth.uid,
				headers: ares.clone(this.auth.headers)
			}
		};
		this.log("event:", event);
		this.doUpdateAuth(event);
		delete this.auth.requestToken;
		delete this.auth.requestTokenSecret;
		this.$.checkBtn.setDisabled(false);
		next();
	},
	getAccountInfo: function(next) {
		var reqOptions = {
			url: this.accountInfoUrl,
			method: 'GET',
			handleAs: 'json',
			cacheBust: false, // cacheBust query parameter not accepted by Dropbox
			headers: {
				Authorization: this.auth.headers.authorization
			}
		};
		this.log("options:", reqOptions);
		var req = new enyo.Ajax(reqOptions);
		req.response(this, function(inSender, inValue) {
			this.log("response:", inValue);
			this.accountInfo = inValue;
			next();
		});
		req.error(this, function(inSender, inError) {
			var errMsg;
			try {
				errMsg = JSON.parse(inSender.xhrResponse.body).error; 
			} catch(e) {
				errMsg = inError;
			}
			this.log("errMsg:", errMsg);
			next(new Error(errMsg));
		});
		req.go();
	},
	waitAccountInfo: function(next) {
		this.$.username.setContent("...");
		this.$.email.setContent("...");
		this.$.country.setContent("...");
		this.$.quota.setContent("...");
		this.$.normal.setContent("...");
		this.$.shared.setContent("...");
		if (next) next();
	},
	displayAccountInfo: function(next) {
		this.log("accountInfo:", this.accountInfo);
		this.$.username.setContent(this.accountInfo.display_name);
		this.$.email.setContent(this.accountInfo.email);
		this.$.country.setContent(this.accountInfo.country);
		var quota = Math.floor(this.accountInfo.quota_info.quota / (1024*1024)) + " MB";
		this.$.quota.setContent(quota);
		var normal = Math.floor(this.accountInfo.quota_info.normal / (1024*1024)) + " MB";
		this.$.normal.setContent(normal);
		var shared = Math.floor(this.accountInfo.quota_info.shared / (1024*1024)) + " MB";
		this.$.shared.setContent(shared);
		if (next) next();
	}
});
