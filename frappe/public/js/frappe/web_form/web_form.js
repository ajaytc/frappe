frappe.provide("frappe.ui");
frappe.provide("frappe.web_form");
import EventEmitterMixin from '../../frappe/event_emitter';

export default class WebForm extends frappe.ui.FieldGroup {
	constructor(opts) {
		super();
		Object.assign(this, opts);
		frappe.web_form = this;
		frappe.web_form.events = {};
		Object.assign(frappe.web_form.events, EventEmitterMixin);
	}

	prepare(web_form_doc, doc) {
		Object.assign(this, web_form_doc);
		this.fields = web_form_doc.web_form_fields;
		this.doc = doc;
	}

	make() {
		super.make();
		this.set_field_values();
		if (this.introduction_text) this.set_form_description(this.introduction_text);
		if (this.allow_print && !this.is_new) this.setup_print_button();
		if (this.allow_delete && !this.is_new) this.setup_delete_button();
		if (this.is_new) this.setup_cancel_button();
		this.setup_primary_action();
		if (this.doc.doctype == "Supplier") this.setup_later_button();
		$(".link-btn").remove();

		// webform client script
		frappe.init_client_script && frappe.init_client_script();
		frappe.web_form.events.trigger('after_load');
	}

	on(fieldname, handler) {
		let field = this.fields_dict[fieldname];
		field.df.change = () => {
			handler(field, field.value);
		};
	}

	set_field_values() {
		if (this.doc.name) this.set_values(this.doc);
		else return;
	}

	set_default_values() {
		let values = frappe.utils.get_query_params();
		delete values.new;
		this.set_values(values);
	}

	set_form_description(intro) {
		let intro_wrapper = document.getElementById('introduction');
		intro_wrapper.innerHTML = intro;
	}

	add_button(name, type, action, wrapper_class = ".web-form-actions") {
		const button = document.createElement("button");
		this.button = button
		button.classList.add("btn", "btn-" + type, "btn-sm", "ml-2");
		button.innerHTML = name;
		button.onclick = action;
		document.querySelector(wrapper_class).appendChild(button);
		if (this.doc.doctype == "Supplier") this.add_note(wrapper_class,name)
	}
	add_note(wrapper_class,name) {
		if(name == "Send Mail Later") {
			const para = document.createElement("p");
			var qq = document.createTextNode("Invitation email to your supplier");
			para.classList.add("help-box", "small", "text-muted" ,"hidden-xs")
			para.appendChild(qq);   
			para.style.cssText = 'text-align: center;padding-left: 103px;font-weight: BOLD;padding-top: 5px;' 
			document.querySelector(wrapper_class).appendChild(para);
		}
	}
	add_button_to_footer(name, type, action) {
		this.add_button(name, type, action, '.web-form-footer');
	}

	add_button_to_header(name, type, action) {
		this.add_button(name, type, action, '.web-form-actions');
	}

	setup_primary_action() {
		this.add_button_to_header(this.button_label || "Save", "primary", () =>
			this.save()
		);

		this.add_button_to_footer(this.button_label || "Save", "primary", () =>
			this.save()
		);
	}

	setup_cancel_button() {
		this.add_button_to_header("Cancel", "light", () => this.cancel());
	}
	setup_later_button() {
		this.get_send_mail_details();
	}
	get_send_mail_details () {
		if (this.doc.email) {
			frappe.call({
				type: "POST",
				method: "frappe.core.doctype.user.user.get_send_mail_details",
				args: {
					email: this.doc.email,
				},
				callback: response => {
					this.add_button_to_footer("Send Mail Later", "primary", () => this.send_mail());
					this.button.setAttribute("style", "background-color: red;");
					if (!response.exc) {
						if (!response.message) {
							this.button.style.backgroundColor = "red";
						}
						else {
							this.button.style.backgroundColor = "#3b3dbf";
						}
					}
				}
			});
		}

	}
	send_mail () {
		frappe.call({
			type: "POST",
			method: "frappe.core.doctype.user.user.send_welcome_mail_to_supplier",
			args: {
				data: this.doc,
			},
			callback: response => {
				if (!response.exc) {
					if (response.message == 'Success') {
						this.button.setAttribute("style", "background-color: #3b3dbf;");
					}
				}
			},
			always: function () {
				window.saving = false;
			}
		});
		return true
	}
	setup_delete_button() {
		this.add_button_to_header(
			'<i class="fa fa-trash" aria-hidden="true"></i>',
			"light",
			() => this.delete()
		);
	}

	setup_print_button() {
		this.add_button_to_header(
			'<i class="fa fa-print" aria-hidden="true"></i>',
			"light",
			() => this.print()
		);
	}

	save() {
		this.validate && this.validate();

		// validation hack: get_values will check for missing data
		let doc_values = super.get_values(this.allow_incomplete);

		if (!doc_values) return;

		if (window.saving) return;
		let for_payment = Boolean(this.accept_payment && !this.doc.paid);

		Object.assign(this.doc, doc_values);
		this.doc.doctype = this.doc_type;
		this.doc.web_form_name = this.name;

		// Save
		window.saving = true;
		frappe.form_dirty = false;

		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.accept",
			args: {
				data: this.doc,
				web_form: this.name,
				docname: this.doc.name,
				for_payment
			},
			callback: response => {
				// Check for any exception in response
				if (!response.exc) {
					// Success
					this.handle_success(response.message);
					frappe.web_form.events.trigger('after_save');
				}
			},
			always: function () {
				window.saving = false;
			}
		});
		return true;
	}

	delete() {
		frappe.call({
			type: "POST",
			method: "frappe.website.doctype.web_form.web_form.delete",
			args: {
				web_form_name: this.name,
				docname: this.doc.name
			},
			callback: response => {
				if (!response.exc) {
					// frappe.msgprint(__(""))
					const success_dialog = new frappe.ui.Dialog({
						title: __("Deleted Successfully"),
						secondary_action: () => {
							if (this.success_url) {
								window.location.pathname = this.success_url;
							} else if (this.login_required) {
								window.location.href =
									window.location.pathname + "?name=" + data.name;
							}
						}
					});

					success_dialog.show();
				}
			}
		});
	}

	print() {
		window.open(`/printview?
			doctype=${this.doc_type}
			&name=${this.doc.name}
			&format=${this.print_format || "Standard"}`, '_blank');
	}

	cancel() {
		window.location.href = window.location.pathname;
	}

	handle_success(data) {
		if (this.accept_payment && !this.doc.paid) {
			window.location.href = data;
		}

		const success_dialog = new frappe.ui.Dialog({
			title: __("Saved Successfully"),
			secondary_action: () => {
				if (this.success_url) {
					window.location.pathname = this.success_url;
				} else if (this.login_required) {
					window.location.href =
						window.location.pathname + "?name=" + data.name;
				}
			}
		});

		success_dialog.show();
		const success_message =
			this.success_message || __("Your information has been submitted");
		success_dialog.set_message(success_message);
	}
}