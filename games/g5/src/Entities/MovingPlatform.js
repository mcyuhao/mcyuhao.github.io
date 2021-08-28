import { TILE_SIZE } from '../constants'
import { ThePlayer, TheWorld, deltaTime } from '../globals'
import { overlapping, generateImage, forRectangularRegion, sign, renderSolidSquare } from '../utils'
import { TheRenderer } from '../Renderer'
import { GridEntity } from './GridEntity'

export class MovingPlatform extends GridEntity {
  constructor (x, y, width, height, xSpeed, ySpeed) {
    super(x, y, width, height)

    this.startX = this.x
    this.startY = this.y

    this.startXSpeed = xSpeed
    this.startYSpeed = ySpeed

    this.reset()

    this.collidable = true
  }

  reset () {
    this.x = this.startX
    this.y = this.startY

    this.xSpeed = this.startXSpeed
    this.ySpeed = this.startYSpeed

    this.xRemainder = 0
    this.yRemainder = 0

    this.collidable = true
  }

  async initialize () {
    this.renderable = await generateImage(this.width, this.height, ctx => {
      forRectangularRegion(0, 0, this.width / TILE_SIZE - 1, this.height / TILE_SIZE - 1, (x, y) => {
        renderSolidSquare(ctx, x, y)
      })
    })
  }

  step () {
    this.collidable = false

    this.xRemainder += this.xSpeed * deltaTime
    this.yRemainder += this.ySpeed * deltaTime

    let dx = Math.round(this.xRemainder)
    let dy = Math.round(this.yRemainder)

    this.xRemainder -= dx
    this.yRemainder -= dy

    // Bouncing off of things
    let collider = this.collideAt(this.x + dx, this.y + dy)

    if (collider) {
      // Check if the other is moving on the same axis
      if (
        (this.xSpeed && sign(collider.xSpeed) === -sign(this.xSpeed)) ||
        (this.ySpeed && sign(collider.ySpeed) === -sign(this.ySpeed))
      ) {
        collider.xSpeed *= -1
        collider.ySpeed *= -1
      }

      if (this.xSpeed > 0) {
        dx -= 2 * ((this.x + dx) % TILE_SIZE)
      } else if (this.xSpeed < 0) {
        dx -= 2 * ((this.x + dx) % TILE_SIZE - TILE_SIZE)
      } else if (this.ySpeed > 0) {
        dy -= 2 * ((this.y + dy) % TILE_SIZE)
      } else {
        dy -= 2 * ((this.y + dy) % TILE_SIZE - TILE_SIZE)
      }

      this.xSpeed *= -1
      this.ySpeed *= -1
    }

    let playerIsRiding = ThePlayer.isRiding(this)

    this.x += dx
    this.y += dy

    // Actually moving the player
    if (ThePlayer.isAlive) {
      if (playerIsRiding) {
        // If the player is dashing we don't have to move the player down when going down
        let newDy = dy < 0 || !ThePlayer.isDashing ? dy : 0
        ThePlayer.move(dx, newDy)
      } else {
        const overlappingPlayer = overlapping(
          ThePlayer.boundingBox,
          this
        )

        if (overlappingPlayer) {
          if (dx) {
            let amount = dx > 0
              ? this.x + this.width - ThePlayer.boundingBox.x
              : this.x - ThePlayer.boundingBox.x - ThePlayer.boundingBox.width
            ThePlayer.moveX(amount, () => {
              ThePlayer.die()
            })
          } else if (dy) {
            let amount = dy > 0
              ? this.y + this.height - ThePlayer.boundingBox.y
              : this.y - ThePlayer.boundingBox.y - ThePlayer.boundingBox.height
            ThePlayer.moveY(amount, () => {
              ThePlayer.die()
            })
          }
        }
      }
    }

    this.collidable = true
  }

  collideAt (x, y) {
    return TheWorld.solidAt(x, y, this.width, this.height, { ignore: this })
  }

  render () {
    TheRenderer.drawImage(this.renderable, this.x, this.y)
  }
}
