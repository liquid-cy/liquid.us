const { WWW_URL } = process.env
const { signIn, updateNameAndAddress } = require('../effects')
const { makePoint } = require('../helpers')
const Component = require('./Component')

const milestones = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000]
function nextMilestone(current) {
  return milestones.filter(ms => ms > current)[0]
}

module.exports = class EndorsementPageSidebar extends Component {
  render() {
    const measure = this.props

    return this.html`

      ${measure.user && measure.vote_position && !measure.comment.endorsed
        // logged in, voted differently
        ? VotedDifferentlyMessage.for(this, { measure }) : ''
      }

      <nav class="box">
        ${module.exports.EndorsementCount.for(this, { measure })}
        ${!measure.user // logged out
          ? module.exports.NewSignupEndorseForm.for(this, { measure })

          : measure.comment.endorsed // logged in, already endorsed
            ? module.exports.AfterEndorseSocialShare.for(this, { measure })

            : // logged in, voted differently or haven't voted
            module.exports.LoggedInForm.for(this, { measure })
        }
        ${measure.user && measure.comment.endorsed && !measure.reply && measure.replyLoaded
          ? module.exports.AfterEndorseComment.for(this, { measure })
          : ''}
      </nav>
    `
  }
}

module.exports.EndorsementCount = class EndorsementCount extends Component {
  render() {
    const { measure } = this.props
    const { all_proxy_vote_count } = measure.comment

    const count = all_proxy_vote_count

    let action = 'endorsed'; let color = 'is-success'
    if (measure.comment.position === 'nay') { action = 'opposed'; color = 'is-danger' }
    if (measure.comment.position === 'abstain') { action = 'weighed in'; color = 'is-success' }

    return this.html`
      <div>
        <p><span class="has-text-weight-bold">${count} ${count === 1 ? 'has' : 'have'} ${action}.</span> Let's get to ${nextMilestone(count)}!</p>
        <progress class=${`progress ${color}`} style="margin-top: 0.5rem; margin-bottom: 1.5rem" value=${count} max=${nextMilestone(count)}>15%</progress>
      </div>
    `
  }
}

module.exports.NewSignupEndorseForm = class NewSignupEndorseForm extends Component {
  onconnected(event) {
    if (window.initGoogleAddressAutocomplete) {
      window.initGoogleAddressAutocomplete(event.currentTarget.getAttribute('id'))
    }
  }
  onsubmit(event, formData) {
    if (event) event.preventDefault()

    const name_pieces = formData.name.split(' ')
    const first_name = name_pieces[0]
    const last_name = name_pieces.slice(1).join(' ')

    if (!first_name || !last_name) {
      return { error: { name: true, message: 'First & last name required.' } }
    }

    if (!formData.email || !formData.email.includes('@')) {
      return { error: { email: true } }
    }

    return signIn({
      email: formData.email,
      location: this.location,
      storage: this.storage,
      redirectTo: this.location.url,
      channel: 'endorsement',
    })(this.state.dispatch).then((user) => {
      const { measure } = this.props
      const { comment, short_id } = measure
      const vote_id = comment.id

      if (user) {
        return updateNameAndAddress({
          addressData: {
            address: formData.address,
            city: window.lastSelectedGooglePlacesAddress.city,
            state: window.lastSelectedGooglePlacesAddress.state,
            geocoords: makePoint(window.lastSelectedGooglePlacesAddress.lon, window.lastSelectedGooglePlacesAddress.lat),
          },
          nameData: { first_name, last_name },
          storage: this.storage,
          user,
        })(this.state.dispatch)
        // Store endorsement
        .then(() => this.api('/rpc/endorse', {
          method: 'POST',
          body: JSON.stringify({ user_id: user.id, vote_id, measure_id: measure.id, public: formData.is_public === 'on' }),
        }))
        // Get new endorsement count
        .then(() => this.api(`/votes_detailed?id=eq.${vote_id}`))
        .then((votes) => {
          // And finally re-render with with the newly registered user and updated count
          this.setState({
            measures: {
              ...this.state.measures,
              [short_id]: {
                ...this.state.measures[short_id],
                comment: votes[0] || this.state.measures[short_id].comment,
                replyLoaded: true,
              }
            },
          })
        })
        .catch((error) => console.log(error))
      }
    })
  }
  render() {
    const { error = {} } = this.state
    const { measure } = this.props

    let action = 'Endorse'; let color = 'is-success'
    if (measure.comment.position === 'nay') { action = 'Join opposition'; color = 'is-danger' }
    if (measure.comment.position === 'abstain') { action = 'Weigh in'; color = 'is-success' }

    return this.html`
      <form method="POST" style="width: 100%;" method="POST" onsubmit=${this} action=${this}>
        <div class="field">
          <label class="label has-text-grey">Your Name *</label>
          <div class="control has-icons-left">
            <input name="name" autocomplete="off" class=${`input ${error && error.name && 'is-danger'}`} placeholder="John Doe" required />
            ${error && error.name
              ? [`<span class="icon is-small is-left"><i class="fas fa-exclamation-triangle"></i></span>`]
              : [`<span class="icon is-small is-left"><i class="fa fa-user"></i></span>`]
            }
            ${error && error.name ? [`<p class="help is-danger">${error.message}</p>`] : ''}
          </div>
        </div>
        <div class="field">
          <label class="label has-text-grey">Your Email *</label>
          <div class="field has-addons join-input-field">
            <div class="${`control is-expanded has-icons-left ${error && error.email ? 'has-icons-right' : ''}`}">
              <input name="email" class="${`input ${error && error.email ? 'is-danger' : ''}`}" type="text" placeholder="you@example.com" required />
              ${error && error.email
                ? [`<span class="icon is-small is-left"><i class="fas fa-exclamation-triangle"></i></span>`]
                : [`<span class="icon is-small is-left"><i class="fa fa-user"></i></span>`]
              }
              ${error && error.email ? [`<p class="help is-danger">This email is invalid.</p>`] : ''}
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-grey">Your Address</label>
          <div class="control has-icons-left">
            <input onconnected=${this} class=${`input ${error && error.address && 'is-danger'}`} autocomplete="off" name="address" id="address_autocomplete_sidebar" placeholder="185 Berry Street, San Francisco, CA 94121" />
            ${error && error.address
              ? [`<span class="icon is-small is-left"><i class="fa fas fa-exclamation-triangle"></i></span>`]
              : [`<span class="icon is-small is-left"><i class="fa fa-map-marker-alt"></i></span>`]
            }
            ${error && error.address ? [`<p class="help is-danger">${error.message}</p>`] : ''}
          </div>
          <p class="is-size-7" style="margin-top: .3rem;">So your reps know you're their constituent.</p>
        </div>
        <div class="field">
          <div class="control">
            <label class="checkbox">
              <input name="is_public" type="checkbox" checked />
              Share my name publicly
            </label>
          </div>
        </div>
        <div class="field">
          <div class="control">
            <button class=${`button ${color} is-fullwidth has-text-weight-bold is-size-5`} type="submit">${action}</button>
          </div>
        </div>
      </form>
    `
  }
}

class VotedDifferentlyMessage extends Component {
  render() {
    const { measure } = this.props

    let previousVote = 'endorsed'
    if (measure.vote_position === 'nay') { previousVote = 'opposed' }
    if (measure.vote_position === 'abstain') { previousVote = 'abstained <span class="has-text-weight-normal">on</span>' }


    return this.html`
      <article class="notification is-warning is-marginless is-size-7">
          You previously <strong>${[previousVote]}</strong> this item.<br />
          This will switch your vote.
      </article>
    `
  }
}


module.exports.LoggedInForm = class LoggedInForm extends Component {
  onconnected(event) {
    if (window.initGoogleAddressAutocomplete) {
      window.initGoogleAddressAutocomplete(event.currentTarget.getAttribute('id'))
    }
  }
  endorse(endorsement) {
    const short_id = this.props.measure.short_id
    return this.api('/rpc/endorse', {
      method: 'POST',
      body: JSON.stringify(endorsement),
    })
    .then(() => this.api(`/votes_detailed?id=eq.${endorsement.vote_id}`))
    .then((votes) => {
      this.setState({
        measures: {
          ...this.state.measures,
          [short_id]: {
            ...this.state.measures[short_id],
            comment: votes[0] || this.state.measures[short_id].comment,
          }
        }
      })
    })
  }
  onsubmit(event, formData) {
    if (event) event.preventDefault()

    const { user } = this.state
    const { measure } = this.props
    const { comment } = measure
    const vote_id = comment.id
    const endorsement = { user_id: user.id, vote_id, measure_id: measure.id, public: formData.is_public === 'on' }

    if (user.first_name) {
      return this.endorse(endorsement).catch((error) => console.log(error))
    }

    const first_name = formData.name.split(' ').slice(0, 1)[0]
    const last_name = formData.name.split(' ').slice(1).join(' ')
    const nameData = { first_name, last_name }
    const addressData = {
      address: formData.address,
      city: window.lastSelectedGooglePlacesAddress.city,
      state: window.lastSelectedGooglePlacesAddress.state,
      geocoords: makePoint(window.lastSelectedGooglePlacesAddress.lon, window.lastSelectedGooglePlacesAddress.lat),
    }

    return updateNameAndAddress({ addressData, nameData, storage: this.state.storage, user })(this.state.dispatch)
      .then(() => this.endorse(endorsement))
      .catch((error) => console.log(error))
  }
  render() {
    const { measure } = this.props
    const { last_vote_public, user } = this.state

    let action = 'Endorse'; let color = 'is-success'
    if (measure.comment.position === 'nay') { action = 'Join opposition'; color = 'is-danger' }
    if (measure.comment.position === 'abstain') { action = 'Weigh in'; color = 'is-success' }

    const name = [user.first_name, user.last_name].filter(a => a).join(' ')
    const address = user.address ? user.address.address : ''

    return this.html`
      <form method="POST" style="width: 100%;" method="POST" onsubmit=${this}>
        <div class="field">
          <label class="label has-text-grey">Your Name *</label>
          <div class="control has-icons-right">
            <input name="name" autocomplete="off" class="input" placeholder="John Doe" required value="${name}" required disabled=${!!name} />
            <span class="icon is-small is-right"><i class="${`fa fa-${name ? 'lock' : 'user'}`}"></i></span>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-grey">Your Email *</label>
          <div class="field has-addons join-input-field">
            <div class="control is-expanded has-icons-right">
              <input name="email" class="input" type="text" placeholder="you@example.com" value=${user.email} required disabled />
              <span class="icon is-small is-right"><i class="fa fa-lock"></i></span>
            </div>
          </div>
        </div>
        <div class="field">
          <label class="label has-text-grey">Your Address</label>
          <div class="control has-icons-right">
            <input onconnected=${this} id="address_autocomplete_sidebar" class="input" autocomplete="off" name="address" placeholder="185 Berry Street, San Francisco, CA 94121" value="${address}" disabled=${!!address} />
            <span class="icon is-small is-right"><i class="${`fa fa-${address ? 'lock' : 'map-marker-alt'}`}"></i></span>
          </div>
          <p class="is-size-7" style="margin-top: .3rem;">So your reps know you're their constituent.</p>
        </div>
        <div class="field">
          <div class="control">
            <label class="checkbox">
              <input name="is_public" type="checkbox" checked=${last_vote_public} />
              Share my name publicly
            </label>
          </div>
        </div>
        <div class="field">
          <div class="control">
            <button class=${`button ${color} is-fullwidth has-text-weight-bold is-size-5`} type="submit">${action}</button>
          </div>
        </div>
      </form>
    `
  }
}

module.exports.AfterEndorseSocialShare = class AfterEndorseSocialShare extends Component {
  render() {
    const { author_username, comment, short_id, title, type } = this.props.measure
    const measure_url = `${author_username ? `/${author_username}/` : '/'}${type === 'nomination' ? 'nominations' : 'legislation'}/${short_id}`
    const comment_url = `${measure_url}/votes/${comment.id}`
    const share_url = `${WWW_URL}${comment_url}`

    let actionIng = 'endorsing'; let actionTo = 'endorse'
    if (comment.position === 'nay') { actionIng = 'opposing'; actionTo = 'oppose' }
    if (comment.position === 'abstain') { actionIng = 'weighing in on'; actionTo = 'weigh in' }
    const share_text = `Join me in ${actionIng} ${title}: ${share_url}`

    return this.html`
      <div class="content">
        <p class="has-text-weight-semibold">Increase your impact by asking your friends and family to ${actionTo}.</p>
        <div class="buttons is-centered">
          <a class="button is-link has-text-weight-bold" title="Share on Facebook" target="_blank" href="${`https://www.facebook.com/sharer/sharer.php?u=${share_url}`}">
            <span class="icon"><i class="fab fa-facebook"></i></span>
            <span>Post on Facebook</span>
          </a>
          <a class="button is-link has-text-weight-bold" title="Share on Twitter" target="_blank" href="${`https://twitter.com/intent/tweet?text=${share_text}`}">
            <span class="icon"><i class="fab fa-twitter"></i></span>
            <span>Tweet your people</span>
          </a>
          <a class="button is-link has-text-weight-bold" title="Share with Email" target="_blank" href="${`mailto:?subject=${title}&body=${share_text}`}">
            <span class="icon"><i class="fa fa-envelope"></i></span>
            <span>Email</span>
          </a>
        </div>
      </div>
    `
  }
}

module.exports.AfterEndorseComment = class AfterEndorseComment extends Component {
  onsubmit(event) {
    event.preventDefault()

    const measure = this.props.measure
    const user = this.state.user
    const form = require('parse-form').parse(event.currentTarget).body

    const reply = {
      vote_id: measure.comment.id,
      user_id: user.id,
      content: form.content,
    }

    this.setState({
      measures: {
        [measure.short_id]: {
          ...measure,
          reply,
        },
      },
    })

    this.api(`/replies`, {
      method: 'POST',
      body: JSON.stringify(reply),
    })
    .then(() => this.api(`/replies_detailed?vote_id=eq.${reply.vote_id}&order=created_at.desc`))
    .then((replies) => this.setState({
      measures: {
        [measure.short_id]: {
          ...measure,
          reply,
          replies,
        },
      },
    }))
  }
  render() {
    const { comment } = this.props.measure
    const loading = this.props.loading

    let afterEndorseMessage = 'Tell others why you endorsed'
    if (comment.position === 'nay') { afterEndorseMessage = 'Tell others why you opposed' }
    if (comment.position === 'abstain') { afterEndorseMessage = 'Share your feedback, questions and ideas here' }

    return this.html`
      <form class="content" onsubmit="${this}">
        <p>${afterEndorseMessage}:</p>
        <div class="field">
          <div class="control">
            <textarea name="content" class="textarea" required style="resize:none;"></textarea>
          </div>
        </div>
        <div class="control">
          <button class="${`button is-link has-text-weight-bold ${loading ? 'is-loading' : ''}`}" disabled=${loading} type="submit">Save</button>
        </div>
      </form>
    `
  }
}
